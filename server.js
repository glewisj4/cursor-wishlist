// --- SERVER SETUP (Run this with Node.js) ---
// Dependencies: npm install express cors puppeteer puppeteer-extra puppeteer-extra-plugin-stealth @google/generative-ai dotenv

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const cheerio = require('cheerio');

// Stealth Puppeteer to bypass basic anti-bot detection
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const app = express();
const path = require('path');

app.use(cors());
app.use(express.json());

// Serve static files from React app (after build)
const reactBuildPath = path.join(__dirname, 'react', 'dealhunter-client', 'dist');
console.log(`📁 React build path: ${reactBuildPath}`);

// Check if dist folder exists
const fs = require('fs');
if (fs.existsSync(reactBuildPath)) {
  console.log(`✅ React build found at: ${reactBuildPath}`);
  app.use(express.static(reactBuildPath));
} else {
  console.warn(`⚠️  React build not found at: ${reactBuildPath}`);
  console.warn(`⚠️  Make sure to run "npm run build" to build the React frontend`);
}

// Initialize Google AI (Gemini)
// Make sure to set GEMINI_API_KEY in your .env file or environment variables
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "YOUR_API_KEY_HERE");

const PORT = process.env.PORT || 3001;

// --- HELPER: Launch Browser with fallback options ---
async function launchBrowser() {
  const puppeteerArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--disable-software-rasterizer',
    '--disable-extensions',
    '--single-process' // Helps on Render
  ];
  
  // Try multiple executable paths (prioritize system Chromium)
  const possiblePaths = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chrome'
  ].filter(Boolean);
  
  // Try with executable path first
  for (const executablePath of possiblePaths) {
    try {
      const fs = require('fs');
      if (fs.existsSync(executablePath)) {
        console.log(`🔍 Trying Chrome at: ${executablePath}`);
        return await puppeteer.launch({
          headless: "new",
          executablePath: executablePath,
          args: puppeteerArgs
        });
      }
    } catch (error) {
      console.log(`⚠️  Failed to use ${executablePath}: ${error.message}`);
      continue;
    }
  }
  
  // Fallback: Let Puppeteer use its bundled Chrome
  console.log(`🔍 Using Puppeteer's bundled Chrome`);
  try {
    // Ensure cache directory exists (for Render)
    const fs = require('fs');
    const cacheDir = process.env.PUPPETEER_CACHE_DIR || '/opt/render/.cache/puppeteer';
    if (!fs.existsSync(cacheDir)) {
      try {
        fs.mkdirSync(cacheDir, { recursive: true });
        console.log(`📁 Created cache directory: ${cacheDir}`);
      } catch (mkdirError) {
        console.warn(`⚠️  Could not create cache directory: ${mkdirError.message}`);
      }
    }
    
    return await puppeteer.launch({
      headless: "new",
      args: puppeteerArgs
    });
  } catch (error) {
    console.error(`❌ Failed to launch browser: ${error.message}`);
    // If Chrome download is needed, provide helpful error message
    if (error.message.includes('Could not find Chrome')) {
      console.error(`💡 Chrome not found. Cache dir: ${process.env.PUPPETEER_CACHE_DIR || '/opt/render/.cache/puppeteer'}`);
      console.error(`💡 Try running: npx puppeteer browsers install chrome`);
    }
    throw error;
  }
}

// --- HELPER: Agentic Browser ---
async function scrapePageContent(url) {
  let browser;
  try {
    console.log(`🌐 Launching browser for: ${url}`);
    browser = await launchBrowser();
    console.log("✅ Browser launched successfully");
    
    const page = await browser.newPage();
    
    // Set a realistic User-Agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    console.log(`📄 Navigating to page...`);
    // Navigate to page and wait for network to be idle (better for dynamic content)
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    console.log("✅ Page loaded successfully");

    // Wait a bit for any dynamic content to load (waitForTimeout was removed, use Promise instead)
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Extract product-specific content with better targeting
    const pageData = await page.evaluate(() => {
      const data = {
        title: '',
        price: '',
        availability: 'In Stock',
        image: '',
        description: ''
      };

      // Try to get product title (Amazon-specific selectors)
      const titleSelectors = [
        '#productTitle',
        'h1.a-size-large',
        'h1[data-automation-id="title"]',
        '.product-title',
        'h1',
        '[data-testid="product-title"]'
      ];
      
      for (const selector of titleSelectors) {
        const element = document.querySelector(selector);
        if (element && element.innerText.trim()) {
          data.title = element.innerText.trim();
          break;
        }
      }

      // Try to get price - retailer-specific selectors
      const urlLower = window.location.href.toLowerCase();
      let priceSelectors = [];
      
      if (urlLower.includes('amazon')) {
        // Amazon-specific selectors
        priceSelectors = [
          '#priceblock_ourprice',
          '#priceblock_dealprice',
          '#priceblock_saleprice',
          '#corePriceDisplay_desktop_feature_div .a-price .a-offscreen',
          '#corePrice_feature_div .a-price .a-offscreen',
          '.a-price.a-text-price .a-offscreen',
          '.a-price .a-offscreen',
          '.a-price-whole',
          '[data-a-color="price"] .a-offscreen',
          '.priceToPay .a-offscreen'
        ];
      } else if (urlLower.includes('lego')) {
        // Lego.com-specific selectors
        priceSelectors = [
          '[data-testid="product-price"]',
          '.product-price',
          '.price',
          '[class*="price"]',
          '[class*="Price"]',
          '.product-details-price',
          'span[class*="price"]',
          'div[class*="price"]'
        ];
      } else if (urlLower.includes('walmart')) {
        // Walmart-specific selectors
        priceSelectors = [
          '[itemprop="price"]',
          '.price-current',
          '[data-automation-id="product-price"]',
          '.prod-PriceHero .price',
          '[class*="price"]'
        ];
      } else if (urlLower.includes('target')) {
        // Target-specific selectors
        priceSelectors = [
          '[data-test="product-price"]',
          '[data-testid="product-price"]',
          '.h-padding-r-tiny',
          '[class*="price"]'
        ];
      } else {
        // Generic selectors for other retailers
        priceSelectors = [
          '[itemprop="price"]',
          '[data-testid*="price"]',
          '[class*="price"]',
          '[id*="price"]',
          '.price',
          '.product-price'
        ];
      }
      
      // Function to check if price is clearly shipping-related (very strict)
      const isShippingPrice = (text, element) => {
        const lowerText = text.toLowerCase();
        const parentText = element?.closest('div')?.innerText?.toLowerCase() || '';
        const combinedText = (lowerText + ' ' + parentText);
        
        // Only flag if it's VERY clearly shipping-related
        // Must have BOTH shipping keyword AND be in shipping section
        const isInShippingSection = element?.closest('[class*="shipping"], [id*="shipping"], [class*="delivery"]');
        const hasShippingKeyword = combinedText.includes('shipping fee') || 
                                   combinedText.includes('shipping cost') ||
                                   combinedText.includes('delivery fee') ||
                                   (combinedText.includes('free shipping') && combinedText.includes('threshold'));
        
        // Only filter if BOTH conditions are true
        if (isInShippingSection && hasShippingKeyword) {
          return true;
        }
        
        // Filter very low prices (< $1) only if explicitly about shipping
        const priceValue = parseFloat(text.replace(/[^0-9.]/g, ''));
        if (priceValue && priceValue < 1 && combinedText.includes('shipping fee')) {
          return true;
        }
        
        return false;
      };
      
      // Try primary price selectors (most reliable for product prices)
      for (const selector of priceSelectors) {
        try {
          const element = document.querySelector(selector);
          if (element) {
            const priceText = element.innerText || element.textContent || '';
            const priceMatch = priceText.match(/[\d,]+\.?\d*/);
            if (priceMatch) {
              const priceValue = priceMatch[0].replace(/,/g, '');
              const numPrice = parseFloat(priceValue);
              
              // Validate price is reasonable
              if (numPrice >= 0.50 && numPrice <= 50000) {
                // Only filter if clearly shipping-related
                if (!isShippingPrice(priceText, element)) {
                  data.price = priceValue;
                  break;
                }
              }
            }
          }
        } catch (e) {
          // Continue to next selector if this one fails
        }
      }
      
      // Fallback: Search in main product area (retailer-agnostic)
      if (!data.price) {
        // Try different main content selectors based on retailer
        let mainContentSelectors = [];
        if (urlLower.includes('amazon')) {
          mainContentSelectors = ['#centerCol', '#dp-container', '[data-feature-name="price"]', '#productDetails_feature_div', '#apex_desktop'];
        } else if (urlLower.includes('lego')) {
          mainContentSelectors = ['main', '[data-testid="product-details"]', '.product-details', '.product-info', 'article'];
        } else if (urlLower.includes('walmart')) {
          mainContentSelectors = ['[data-automation-id="product-overview"]', '.prod-ProductTitle', 'main'];
        } else if (urlLower.includes('target')) {
          mainContentSelectors = ['[data-test="product-details"]', 'main'];
        } else {
          mainContentSelectors = ['main', 'article', '[class*="product"]', '[id*="product"]'];
        }
        
        let mainContent = null;
        for (const sel of mainContentSelectors) {
          mainContent = document.querySelector(sel);
          if (mainContent) break;
        }
        
        if (mainContent) {
          // Search for price patterns in main content
          const pricePatterns = [
            { selector: '[class*="price"]', priority: 1 },
            { selector: '[id*="price"]', priority: 2 },
            { selector: '[data-testid*="price"]', priority: 3 },
            { selector: '[itemprop="price"]', priority: 4 }
          ];
          
          for (const pattern of pricePatterns) {
            const priceEl = mainContent.querySelector(pattern.selector);
            if (priceEl) {
              const priceText = priceEl.innerText || priceEl.textContent || '';
              const priceMatch = priceText.match(/\$?([\d,]+\.?\d*)/);
              if (priceMatch) {
                const priceValue = priceMatch[1].replace(/,/g, '');
                const numPrice = parseFloat(priceValue);
                if (numPrice >= 0.50 && numPrice <= 50000 && !isShippingPrice(priceText, priceEl)) {
                  data.price = priceValue;
                  break;
                }
              }
            }
          }
          
          // Last resort: find any price in product area (avoid shipping sections)
          if (!data.price) {
            const allPrices = Array.from(mainContent.querySelectorAll('*'))
              .filter(el => {
                const text = el.innerText || el.textContent || '';
                // Look for price patterns: $XX.XX or XX.XX with currency context
                return (text.includes('$') && /\$?\s*[\d,]+\.?\d*/.test(text)) || 
                       (/\d+\.\d{2}/.test(text) && (el.className?.toLowerCase().includes('price') || 
                                                     el.id?.toLowerCase().includes('price') ||
                                                     el.getAttribute('data-testid')?.toLowerCase().includes('price')));
              });
            
            for (const priceEl of allPrices.slice(0, 15)) {
              const priceText = priceEl.innerText || priceEl.textContent || '';
              const context = priceEl.closest('div, section, article')?.innerText?.toLowerCase() || '';
              
              // Skip shipping sections (very strict - only skip if clearly shipping)
              if ((context.includes('shipping fee') || context.includes('shipping cost')) && 
                  !context.includes('product') && !context.includes('price')) {
                continue;
              }
              
              const priceMatch = priceText.match(/\$?\s*([\d,]+\.?\d*)/);
              if (priceMatch) {
                const priceValue = priceMatch[1].replace(/,/g, '');
                const numPrice = parseFloat(priceValue);
                if (numPrice >= 0.50 && numPrice <= 50000) {
                  data.price = priceValue;
                  break;
                }
              }
            }
          }
        }
      }

      // Try to get availability
      const availabilitySelectors = [
        '#availability span',
        '#availability',
        '[data-automation-id="availability"]',
        '.a-color-success',
        '.stock-status'
      ];
      
      for (const selector of availabilitySelectors) {
        const element = document.querySelector(selector);
        if (element) {
          const availText = element.innerText.toLowerCase();
          if (availText.includes('out of stock') || availText.includes('unavailable')) {
            data.availability = 'Out of Stock';
          }
          break;
        }
      }

      // Try to get main product image (Amazon-specific)
      const imageSelectors = [
        '#landingImage',
        '#imgBlkFront',
        '#main-image',
        '.a-dynamic-image',
        'img[data-a-image-name="landingImage"]'
      ];
      
      for (const selector of imageSelectors) {
        const element = document.querySelector(selector);
        if (element && element.src) {
          data.image = element.src;
          break;
        }
      }

      // Collect all potential product images
      const allImages = [];
      const imgs = Array.from(document.querySelectorAll('img'));
      
      imgs.forEach(img => {
        const src = img.src || '';
        const alt = (img.alt || '').toLowerCase();
        const width = img.width || 0;
        const height = img.height || 0;
        
        // Filter out small images, logos, icons, and sprites
        if (width > 100 && height > 100 && 
            !src.includes('sprite') && 
            !src.includes('logo') && 
            !src.includes('icon') &&
            !alt.includes('logo') &&
            !alt.includes('icon')) {
          allImages.push({
            src: src,
            width: width,
            height: height,
            alt: alt || ''
          });
        }
      });
      
      // Sort by size (largest first)
      allImages.sort((a, b) => (b.width * b.height) - (a.width * a.height));
      
      // Set main image if not already set
      if (!data.image && allImages.length > 0) {
        data.image = allImages[0].src;
      }
      
      // Store all images for alternative selection
      data.allImages = allImages.slice(0, 10).map(img => img.src); // Top 10 images

      // Get description/main content
      const descSelectors = [
        '#feature-bullets',
        '#productDescription',
        '.product-description',
        '[data-automation-id="product-description"]'
      ];
      
      for (const selector of descSelectors) {
        const element = document.querySelector(selector);
        if (element && element.innerText.trim()) {
          data.description = element.innerText.trim().substring(0, 5000);
          break;
        }
      }

      // Fallback: get body text if no specific content found
      if (!data.description) {
        data.description = document.body.innerText.substring(0, 10000);
      }

      return data;
    });

    console.log(`📝 Extracted data:`, {
      title: pageData.title ? pageData.title.substring(0, 50) + '...' : 'Not found',
      price: pageData.price || 'Not found',
      image: pageData.image ? 'Found' : 'Not found',
      availability: pageData.availability || 'Not found'
    });
    
    // Log if price extraction failed
    if (!pageData.price) {
      console.warn(`⚠️  Price not found - may need to check page structure`);
    } else {
      console.log(`✅ Price extracted successfully: $${pageData.price}`);
    }

    // Combine all text for AI analysis
    const combinedText = [
      pageData.title,
      `Price: ${pageData.price || 'Not found'}`,
      `Availability: ${pageData.availability}`,
      pageData.description
    ].filter(Boolean).join('\n\n');

    return { 
      text: combinedText, 
      image: pageData.image,
      allImages: pageData.allImages || [],
      extracted: {
        title: pageData.title,
        price: pageData.price,
        availability: pageData.availability
      }
    };
  } catch (error) {
    console.error("❌ Puppeteer scraping failed:", error.message);
    
    // Fallback to simple HTTP fetch if Puppeteer fails
    if (error.message.includes('Could not find Chrome') || error.message.includes('Failed to launch browser')) {
      console.log("⚠️  Chrome not available, using HTTP fallback mode...");
      try {
        return await scrapePageContentSimple(url);
      } catch (fallbackError) {
        console.error("❌ HTTP fallback also failed:", fallbackError.message);
        throw new Error(`Failed to access site: ${fallbackError.message}`);
      }
    }
    
    throw new Error(`Failed to access site: ${error.message}`);
  } finally {
    if (browser) {
      try {
        await browser.close();
        console.log("🔒 Browser closed");
      } catch (closeError) {
        console.error("Error closing browser:", closeError);
      }
    }
  }
}

// --- HELPER: AI Analysis ---
async function analyzeWithGemini(text, imageUrl) {
  // Check if API key is configured
  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "YOUR_API_KEY_HERE") {
    console.warn("⚠️ GEMINI_API_KEY not configured. Using fallback extraction.");
    // Fallback: Simple text parsing without AI
    return extractProductInfoFallback(text, imageUrl);
  }

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" }); // Use efficient model

    const prompt = `
      I have scraped a product page. Here is the raw text content:
      """${text}"""
      
      The potential main image URL is: "${imageUrl}"

      Please analyze this text and extract the following product details in strictly valid JSON format:
      {
        "name": "Exact Product Name",
        "price": "Numerical price (e.g. 29.99) - remove currency symbols. IMPORTANT: Extract ONLY the actual product price, NOT shipping fees, shipping thresholds, or delivery costs. Ignore any prices related to shipping, delivery, or free shipping thresholds.",
        "store": "Retailer Name (e.g. Amazon, Walmart)",
        "availability": "In Stock or Out of Stock",
        "imageUrl": "The validated image URL (use the one provided if it looks correct, or find a better one in text if possible)"
      }
      If you cannot find a specific field, use null. return ONLY the JSON string.
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const textResponse = response.text();
    
    // Clean up code blocks if AI adds them
    const jsonString = textResponse.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(jsonString);
  } catch (error) {
    console.error("Gemini API Error:", error);
    console.log("Falling back to simple extraction...");
    return extractProductInfoFallback(text, imageUrl);
  }
}

// Fallback extraction without AI
function extractProductInfoFallback(text, imageUrl) {
  const lowerText = text.toLowerCase();
  let store = 'Other';
  let name = 'Imported Product';
  
  // Detect store from URL or text
  if (lowerText.includes('amazon') || lowerText.includes('amzn')) store = 'Amazon';
  else if (lowerText.includes('walmart')) store = 'Walmart';
  else if (lowerText.includes('target')) store = 'Target';
  else if (lowerText.includes('meijer')) store = 'Meijer';
  else if (lowerText.includes('lego')) store = 'Lego';
  
  // Try to extract price (look for $XX.XX pattern)
  const priceMatch = text.match(/\$(\d+\.?\d*)/);
  const price = priceMatch ? priceMatch[1] : null;
  
  // Try to extract product name (first line or title-like text)
  const lines = text.split('\n').filter(line => line.trim().length > 10);
  if (lines.length > 0) {
    name = lines[0].substring(0, 100).trim();
  }
  
  return {
    name: name || null,
    price: price || null,
    store: store,
    availability: 'In Stock',
    imageUrl: imageUrl || null
  };
}

// --- API ENDPOINTS ---

// 1. EXTRACT: Takes a URL, visits it, and returns details
app.post('/api/extract', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "URL is required" });

  try {
    console.log(`\n🔍 [EXTRACT] Request received for: ${url}`);
    const { text, image, extracted } = await scrapePageContent(url);
    
    // If we got good extracted data, use it directly (especially for Amazon)
    if (extracted && extracted.title && extracted.title !== 'Main content' && extracted.title.length > 5) {
      console.log(`✅ Using direct extraction (no AI needed)`);
      console.log(`📊 Extracted data check:`, {
        title: extracted.title?.substring(0, 50),
        price: extracted.price,
        availability: extracted.availability
      });
      const result = {
        name: extracted.title,
        price: extracted.price || null,
        store: url.toLowerCase().includes('amazon') ? 'Amazon' : 
               url.toLowerCase().includes('walmart') ? 'Walmart' :
               url.toLowerCase().includes('target') ? 'Target' :
               url.toLowerCase().includes('meijer') ? 'Meijer' :
               url.toLowerCase().includes('lego') ? 'Lego' : 'Other',
        availability: extracted.availability || 'In Stock',
        imageUrl: image || null
      };
      console.log(`✅ Extraction successful:`, result);
      if (!result.price) {
        console.warn(`⚠️  WARNING: Price is null in final result!`);
      }
      return res.json(result);
    }
    
    console.log(`🤖 Analyzing with AI...`);
    const data = await analyzeWithGemini(text, image);
    console.log(`✅ Extraction successful:`, data);
    
    res.json(data);
  } catch (error) {
    console.error(`❌ [EXTRACT] Error:`, error.message);
    res.status(500).json({ error: error.message });
  }
});

// 2. GET ALTERNATIVE IMAGES: Returns multiple image options from a URL
app.post('/api/get-images', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "URL is required" });

  try {
    console.log(`\n🖼️ [GET-IMAGES] Request received for: ${url}`);
    const { allImages } = await scrapePageContent(url);
    
    // Return unique images only
    const uniqueImages = [...new Set(allImages || [])].filter(img => img && img.length > 0);
    console.log(`✅ Found ${uniqueImages.length} image options`);
    
    res.json({ images: uniqueImages });
  } catch (error) {
    console.error(`❌ [GET-IMAGES] Error:`, error.message);
    res.status(500).json({ error: error.message });
  }
});

// 3. SEARCH PRODUCT: Search for product across multiple retailers
app.post('/api/search-product', async (req, res) => {
  const { productName, currentStore } = req.body;
  if (!productName) return res.status(400).json({ error: "Product name is required" });

  try {
    console.log(`\n🔍 [SEARCH-PRODUCT] Searching for: ${productName}`);
    
    const retailers = [
      { name: 'Amazon', domain: 'amazon.com', searchUrl: 'https://www.amazon.com/s?k=' },
      { name: 'Walmart', domain: 'walmart.com', searchUrl: 'https://www.walmart.com/search?q=' },
      { name: 'Target', domain: 'target.com', searchUrl: 'https://www.target.com/s?searchTerm=' },
      { name: 'eBay', domain: 'ebay.com', searchUrl: 'https://www.ebay.com/sch/i.html?_nkw=' },
      { name: 'Best Buy', domain: 'bestbuy.com', searchUrl: 'https://www.bestbuy.com/site/searchpage.jsp?st=' },
      { name: 'Home Depot', domain: 'homedepot.com', searchUrl: 'https://www.homedepot.com/s/' },
      { name: 'Lowe\'s', domain: 'lowes.com', searchUrl: 'https://www.lowes.com/search?searchTerm=' },
      { name: 'Costco', domain: 'costco.com', searchUrl: 'https://www.costco.com/CatalogSearch?dept=All&keyword=' },
      { name: 'Sam\'s Club', domain: 'samsclub.com', searchUrl: 'https://www.samsclub.com/s/' },
      { name: 'Macy\'s', domain: 'macys.com', searchUrl: 'https://www.macys.com/shop/featured/' }
    ];

    // Filter out current store if provided
    const storesToSearch = currentStore 
      ? retailers.filter(r => r.name.toLowerCase() !== currentStore.toLowerCase())
      : retailers;

    const results = [];
    let browser;

    try {
      browser = await launchBrowser();

      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

      // Search up to 10 retailers (limit to avoid timeout)
      for (const retailer of storesToSearch.slice(0, 10)) {
        try {
          const searchUrl = `${retailer.searchUrl}${encodeURIComponent(productName)}`;
          console.log(`  Searching ${retailer.name}...`);
          
          await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
          await new Promise(resolve => setTimeout(resolve, 2000));

          // Extract product results with exact matching
          const productData = await page.evaluate((retailerName, searchProductName) => {
            const results = [];
            const searchWords = searchProductName.toLowerCase().split(/\s+/).filter(w => w.length > 2);
            
            // Function to calculate similarity between two strings
            const calculateSimilarity = (str1, str2) => {
              const words1 = str1.toLowerCase().split(/\s+/);
              const words2 = str2.toLowerCase().split(/\s+/);
              const commonWords = words1.filter(w => words2.includes(w));
              return commonWords.length / Math.max(words1.length, words2.length);
            };

            let productLinks = [];
            
            // Get multiple product results (not just first one)
            if (retailerName === 'Amazon') {
              productLinks = Array.from(document.querySelectorAll('h2 a[href*="/dp/"], h2 a[href*="/gp/product/"]')).slice(0, 5);
            } else if (retailerName === 'Walmart') {
              productLinks = Array.from(document.querySelectorAll('a[data-testid="product-title"]')).slice(0, 5);
            } else if (retailerName === 'Target') {
              productLinks = Array.from(document.querySelectorAll('a[data-test="product-title"]')).slice(0, 5);
            } else {
              productLinks = Array.from(document.querySelectorAll('a[href*="/p/"], a[href*="/product/"], a[href*="/dp/"]')).slice(0, 5);
            }

            productLinks.forEach(link => {
              const title = (link.innerText || link.textContent || '').trim();
              if (!title) return;

              // Calculate similarity - require at least 60% match
              const similarity = calculateSimilarity(searchProductName, title);
              if (similarity < 0.6) return; // Skip if not similar enough

              const data = { 
                retailer: retailerName, 
                url: link.href.startsWith('http') ? link.href : `https://${window.location.hostname}${link.href}`, 
                title: title, 
                price: null, 
                salePrice: null,
                originalPrice: null,
                description: '' 
              };

              // Function to check if price is shipping-related
              const isShippingPrice = (priceText, element) => {
                const lowerText = priceText.toLowerCase();
                const parentText = element?.closest('div')?.innerText?.toLowerCase() || '';
                const combinedText = (lowerText + ' ' + parentText);
                
                const shippingKeywords = ['shipping', 'delivery', 'free shipping', 'shipping fee', 'threshold', 'minimum'];
                if (shippingKeywords.some(keyword => combinedText.includes(keyword) && !combinedText.includes('product'))) {
                  return true;
                }
                
                const priceValue = parseFloat(priceText.replace(/[^0-9.]/g, ''));
                // Check for common shipping thresholds (25-35 range often indicates free shipping threshold)
                if (priceValue && priceValue >= 25 && priceValue <= 35 && combinedText.includes('free') && combinedText.includes('shipping')) {
                  return true;
                }
                
                return false;
              };

              // Extract prices (including sale prices) - exclude shipping
              if (retailerName === 'Amazon') {
                const priceContainer = link.closest('[data-component-type="s-search-result"]') || link.closest('.s-result-item');
                if (priceContainer) {
                  // Try to get sale price first (more specific selectors)
                  const salePriceEl = priceContainer.querySelector('.a-price.a-text-price .a-offscreen');
                  const regularPriceEl = priceContainer.querySelector('.a-price:not([class*="shipping"]):not([class*="delivery"]) .a-offscreen');
                  
                  if (salePriceEl && !isShippingPrice(salePriceEl.innerText || salePriceEl.textContent || '', salePriceEl)) {
                    const priceText = salePriceEl.innerText || salePriceEl.textContent || '';
                    const match = priceText.match(/[\d,]+\.?\d*/);
                    if (match) {
                      const price = parseFloat(match[0].replace(/,/g, ''));
                      if (price >= 0.50 && price <= 50000) {
                        data.salePrice = match[0].replace(/,/g, '');
                      }
                    }
                  }
                  
                  if (regularPriceEl && !isShippingPrice(regularPriceEl.innerText || regularPriceEl.textContent || '', regularPriceEl)) {
                    const priceText = regularPriceEl.innerText || regularPriceEl.textContent || '';
                    const match = priceText.match(/[\d,]+\.?\d*/);
                    if (match) {
                      const price = parseFloat(match[0].replace(/,/g, ''));
                      if (price >= 0.50 && price <= 50000) {
                        const priceValue = match[0].replace(/,/g, '');
                        if (!data.salePrice) data.price = priceValue;
                        else data.originalPrice = priceValue;
                      }
                    }
                  }
                }
              } else if (retailerName === 'Walmart') {
                const itemContainer = link.closest('[data-testid="item-stack"]') || link.closest('div[class*="item"]');
                if (itemContainer) {
                  // Look for product price, exclude shipping
                  const priceElements = itemContainer.querySelectorAll('[itemprop="price"], .price-current, [class*="price"]:not([class*="shipping"])');
                  
                  for (const priceEl of priceElements) {
                    const priceText = priceEl.getAttribute('content') || priceEl.innerText || '';
                    if (isShippingPrice(priceText, priceEl)) continue;
                    
                    const match = priceText.match(/[\d,]+\.?\d*/);
                    if (match) {
                      const price = parseFloat(match[0].replace(/,/g, ''));
                      if (price >= 0.50 && price <= 50000) {
                        // Check if it's a sale price (has strike-through nearby)
                        const hasStrike = priceEl.closest('div')?.querySelector('.price-old, .price-was, [class*="strike"]');
                        if (hasStrike) {
                          data.salePrice = match[0].replace(/,/g, '');
                          const originalText = hasStrike.innerText || '';
                          const origMatch = originalText.match(/[\d,]+\.?\d*/);
                          if (origMatch) data.originalPrice = origMatch[0].replace(/,/g, '');
                        } else if (!data.price) {
                          data.price = match[0].replace(/,/g, '');
                        }
                        break; // Use first valid price found
                      }
                    }
                  }
                }
              } else if (retailerName === 'Target') {
                const itemContainer = link.closest('[data-test="product-details"]') || link.closest('div[class*="product"]');
                if (itemContainer) {
                  // Get product price, exclude shipping
                  const priceElements = itemContainer.querySelectorAll('[data-test="product-price"]:not([class*="shipping"])');
                  
                  for (const priceEl of priceElements) {
                    const priceText = priceEl.innerText || '';
                    if (isShippingPrice(priceText, priceEl)) continue;
                    
                    const match = priceText.match(/[\d,]+\.?\d*/);
                    if (match) {
                      const price = parseFloat(match[0].replace(/,/g, ''));
                      if (price >= 0.50 && price <= 50000) {
                        // Check if it's a sale (red text usually indicates sale)
                        if (priceEl.classList.contains('h-text-red') || priceEl.closest('[class*="sale"]')) {
                          data.salePrice = match[0].replace(/,/g, '');
                        } else if (!data.price) {
                          data.price = match[0].replace(/,/g, '');
                        }
                        break;
                      }
                    }
                  }
                }
              }

              results.push(data);
            });

            // Return best match (highest similarity)
            if (results.length > 0) {
              results.sort((a, b) => {
                const simA = calculateSimilarity(searchProductName, a.title);
                const simB = calculateSimilarity(searchProductName, b.title);
                return simB - simA;
              });
              return results[0]; // Return best match
            }

            return null;
          }, retailer.name, productName);

          if (productData && productData.url) {
            // Only add if it's an exact match (similarity check already done in evaluate)
            const finalPrice = productData.salePrice || productData.price;
            results.push({
              retailer: retailer.name,
              title: productData.title,
              url: productData.url,
              price: finalPrice || null,
              salePrice: productData.salePrice || null,
              originalPrice: productData.originalPrice || null,
              description: `Find ${productName} at ${retailer.name}`
            });
            console.log(`  ✅ Found exact match from ${retailer.name} - Price: $${finalPrice || 'N/A'}`);
          } else {
            console.log(`  ⚠️  No exact match found at ${retailer.name}`);
          }
        } catch (error) {
          console.log(`  ⚠️  Error searching ${retailer.name}:`, error.message);
          // Continue to next retailer
        }
      }

    } finally {
      if (browser) await browser.close();
    }

    console.log(`✅ Search complete: Found ${results.length} results`);
    res.json({ results: results.slice(0, 10) }); // Return top 10

  } catch (error) {
    console.error(`❌ [SEARCH-PRODUCT] Error:`, error.message);
    res.status(500).json({ error: error.message });
  }
});

// 4. SEARCH DEALS: (Simplified) - Could use Google Search API here
// For now, checks the specific URL provided for price changes
app.post('/api/check-price', async (req, res) => {
  const { url, currentPrice } = req.body;
  if (!url) return res.status(400).json({ error: "URL is required" });

  try {
    console.log(`\n💰 [CHECK-PRICE] Checking price for: ${url}`);
    const { text, image, extracted } = await scrapePageContent(url);
    
    // Use direct extraction first (has improved price extraction logic)
    let data;
    if (extracted && extracted.title && extracted.title !== 'Main content' && extracted.title.length > 5) {
      console.log(`✅ Using direct extraction for price check`);
      data = {
        name: extracted.title,
        price: extracted.price || null,
        store: url.toLowerCase().includes('amazon') ? 'Amazon' : 
               url.toLowerCase().includes('walmart') ? 'Walmart' :
               url.toLowerCase().includes('target') ? 'Target' :
               url.toLowerCase().includes('meijer') ? 'Meijer' :
               url.toLowerCase().includes('lego') ? 'Lego' : 'Other',
        availability: extracted.availability || 'In Stock',
        imageUrl: image || null
      };
      console.log(`📊 Price check result:`, { price: data.price, currentPrice });
    } else {
      // Fallback to AI only if direct extraction didn't work
      console.log(`🤖 Falling back to AI analysis for price check`);
      data = await analyzeWithGemini(text, image);
    }
    
    // Simple logic to detect "Deal"
    let dealFound = false;
    if (data.price && currentPrice) {
      const newPrice = parseFloat(data.price);
      const oldPrice = parseFloat(currentPrice);
      if (!isNaN(newPrice) && !isNaN(oldPrice) && newPrice < oldPrice) {
        dealFound = true;
        console.log(`🔥 Deal found! Price dropped from $${oldPrice} to $${newPrice}`);
      }
    }
    
    if (!data.price) {
      console.warn(`⚠️  No price found during price check`);
    }
    
    res.json({ ...data, dealFound });
  } catch (error) {
    console.error(`❌ [CHECK-PRICE] Error:`, error.message);
    res.status(500).json({ error: error.message });
  }
});

// Health check endpoint (before React app middleware)
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Serve React app for all non-API routes (SPA fallback)
// Use app.use() instead of app.get('*') for Express 5 compatibility
// This must be placed AFTER all API routes
app.use((req, res, next) => {
  // Skip API routes and health check - they're handled above
  if (req.path.startsWith('/api/') || req.path === '/health') {
    return next(); // Continue to next middleware (which will 404 if route not found)
  }
  
  // Serve React app's index.html for all other routes
  const indexPath = path.join(reactBuildPath, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      console.error(`❌ Error serving React app: ${err.message}`);
      console.error(`📁 Looking for: ${indexPath}`);
      // If React app isn't built yet, show API info
      res.json({ 
        status: 'online',
        service: 'DealHunter API',
        note: 'React frontend not built. Build path: ' + reactBuildPath,
        error: err.message,
        endpoints: {
          extract: '/api/extract',
          checkPrice: '/api/check-price',
          getImages: '/api/get-images',
          searchProduct: '/api/search-product'
        }
      });
    }
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Agentic Backend running on port ${PORT}`);
  console.log(`📡 API endpoint: http://0.0.0.0:${PORT}/api/extract`);
  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "YOUR_API_KEY_HERE") {
    console.log(`⚠️  GEMINI_API_KEY not configured - will use fallback extraction`);
  } else {
    console.log(`✅ GEMINI_API_KEY configured`);
  }
});