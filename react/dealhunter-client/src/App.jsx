import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  signInWithCustomToken,
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  onSnapshot, 
  updateDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp,
  query,
  orderBy
} from 'firebase/firestore';
import { 
  Gift, 
  Plus, 
  Search, 
  ExternalLink, 
  Trash2, 
  AlertCircle, 
  CheckCircle, 
  Clock, 
  MapPin, 
  DollarSign, 
  Calendar,
  ShoppingBag,
  Bell,
  RefreshCw,
  Settings,
  Wand2,
  Loader2,
  Image as ImageIcon,
  Server,
  WifiOff,
  Edit2,
  ChevronDown,
  ChevronUp,
  Info
} from 'lucide-react';

// --- Firebase Configuration ---
// --- Firebase Configuration ---
// PASTE YOUR REAL CONFIG FROM FIREBASE CONSOLE HERE:
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyB0Rsz5AntberYFTfO3zBBPrZuo2enYV0k",
  authDomain: "dealhunter-29a11.firebaseapp.com",
  projectId: "dealhunter-29a11",
  storageBucket: "dealhunter-29a11.firebasestorage.app",
  messagingSenderId: "448818312244",
  appId: "1:448818312244:web:8f92176bd9f2fac4d80661",
  measurementId: "G-J87FQ98L0T"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = "my-local-app"; // You can name this whatever you want
const __initial_auth_token = null; // Add this so the code doesn't crash

// --- Constants ---
const RETAILERS = ['Amazon', 'Walmart', 'Meijer', 'Target', 'Lego', 'Other'];

export default function App() {
  const [user, setUser] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('list'); // 'list', 'add', 'edit', 'settings'
  const [alerts, setAlerts] = useState([]);
  const [isChecking, setIsChecking] = useState(false);
  const [isAutoFilling, setIsAutoFilling] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [firebaseStatus, setFirebaseStatus] = useState({ connected: false, auth: false, firestore: false, error: null });
  const [editingItemId, setEditingItemId] = useState(null);
  const [alternativeImages, setAlternativeImages] = useState([]);
  const [isLoadingImages, setIsLoadingImages] = useState(false);
  const [showImageSelector, setShowImageSelector] = useState(false);
  const [expandedItems, setExpandedItems] = useState(new Set());
  const [searchResults, setSearchResults] = useState({}); // { itemId: [results] }
  const [isSearching, setIsSearching] = useState({}); // { itemId: true/false }
  
  // Infrastructure Configuration
  // Use environment variable or default to relative path (same origin) for production
  const defaultBackendUrl = import.meta.env.VITE_BACKEND_URL || 
    (window.location.hostname === 'localhost' ? 'http://localhost:3001' : '');
  const [backendUrl, setBackendUrl] = useState(defaultBackendUrl);

  // Form State
  const [newItem, setNewItem] = useState({
    name: '',
    url: '',
    price: '',
    store: 'Amazon',
    neededBy: '',
    local: false,
    notes: '',
    imageUrl: '',
    availability: 'In Stock'
  });

  // --- Auth & Data Initialization ---
  useEffect(() => {
    // Load backend URL from local storage if saved
    const savedUrl = localStorage.getItem('dealhunter_backend');
    if (savedUrl) setBackendUrl(savedUrl);

    // Set a timeout to allow app to render even if Firebase fails
    let timeoutId;
    timeoutId = setTimeout(() => {
      setLoading(false);
      console.warn("Firebase auth taking too long, allowing app to render anyway");
    }, 3000); // 3 second timeout

    // Test Firebase Connection
    const testFirebaseConnection = async () => {
      console.log("🔍 Testing Firebase connection...");
      console.log("📋 Firebase Config:", {
        projectId: firebaseConfig.projectId,
        authDomain: firebaseConfig.authDomain,
        apiKey: firebaseConfig.apiKey ? `${firebaseConfig.apiKey.substring(0, 10)}...` : 'missing'
      });

      try {
        // Test Firestore connection
        const testCollection = collection(db, 'artifacts', appId, 'public', 'data', 'wishlist_items');
        console.log("✅ Firestore collection reference created successfully");
        setFirebaseStatus(prev => ({ ...prev, firestore: true }));
      } catch (error) {
        console.error("❌ Firestore connection failed:", error);
        setFirebaseStatus(prev => ({ ...prev, firestore: false, error: error.message }));
      }
    };

    const initAuth = async () => {
      try {
        console.log("🔐 Initializing Firebase Auth...");
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
          console.log("✅ Signed in with custom token");
        } else {
          await signInAnonymously(auth);
          console.log("✅ Signed in anonymously");
        }
        setFirebaseStatus(prev => ({ ...prev, auth: true, connected: true }));
      } catch (error) {
        console.error("❌ Auth failed:", error);
        setFirebaseStatus(prev => ({ ...prev, auth: false, error: error.message }));
        // Allow app to continue even if auth fails
        setLoading(false);
      }
    };
    
    // Run connection test
    testFirebaseConnection();
    initAuth();
    
    const unsubscribeAuth = onAuthStateChanged(auth, (u) => {
      if (u) {
        console.log("✅ Firebase Auth State Changed - User:", u.uid);
        setFirebaseStatus(prev => ({ ...prev, auth: true, connected: true }));
      } else {
        console.log("⚠️ Firebase Auth State Changed - No user");
        setFirebaseStatus(prev => ({ ...prev, auth: false }));
      }
      setUser(u);
      setLoading(false);
      clearTimeout(timeoutId);
    });
    
    return () => {
      unsubscribeAuth();
      clearTimeout(timeoutId);
    };
  }, []);

  // --- Firestore Listener ---
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    try {
      console.log("📡 Setting up Firestore listener...");
      const q = collection(db, 'artifacts', appId, 'public', 'data', 'wishlist_items');
      const unsubscribe = onSnapshot(q, (snapshot) => {
        console.log(`✅ Firestore snapshot received: ${snapshot.docs.length} items`);
        const loadedItems = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        loadedItems.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setItems(loadedItems);
        setLoading(false);
        setFirebaseStatus(prev => ({ ...prev, firestore: true, connected: true }));
      }, (error) => {
        console.error("❌ Firestore listener error:", error);
        setFirebaseStatus(prev => ({ ...prev, firestore: false, error: error.message }));
        setLoading(false);
        
        // Show user-friendly error for permissions
        if (error.code === 'permission-denied' || error.message.includes('permissions')) {
          setAlerts(prev => [...prev, { 
            id: Date.now(), 
            msg: "⚠️ Firestore permissions error. Please update Firestore security rules in Firebase Console. See FIREBASE_SETUP.md for instructions.", 
            type: 'warn',
            autoClose: true
          }]);
        }
      });
      return () => unsubscribe();
    } catch (error) {
      console.error("❌ Firestore setup error:", error);
      setFirebaseStatus(prev => ({ ...prev, firestore: false, error: error.message }));
      setLoading(false);
    }
  }, [user]);

  // Auto-close alerts after 3 seconds
  useEffect(() => {
    const timers = [];
    
    alerts.forEach(alert => {
      // Default to auto-close unless explicitly set to false
      if (alert.autoClose !== false) {
        const timer = setTimeout(() => {
          setAlerts(prev => prev.filter(a => a.id !== alert.id));
        }, 3000);
        timers.push(timer);
      }
    });
    
    // Cleanup function to clear all timers
    return () => {
      timers.forEach(timer => clearTimeout(timer));
    };
  }, [alerts]);

  // --- Agentic AI: REAL Backend Integration with Fallback ---
  
  // 1. Check Prices (Batch)
  const checkPrices = async () => {
    if (items.length === 0 || isChecking) return;
    
    setIsChecking(true);
    let dealsFoundCount = 0;
    let backendFailed = false;
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.status === 'purchased' || !item.url) continue;

      setStatusMessage(`Agent visiting ${item.store} for "${item.name}"...`);
      
      const updates = { lastChecked: new Date().toISOString() };
      let newAlert = null;

      try {
        // CALL THE REAL BACKEND
        const response = await fetch(`${backendUrl}/api/check-price`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: item.url, currentPrice: item.originalPrice })
        });

        if (!response.ok) throw new Error('Network response was not ok');
        
        const data = await response.json();
        
        // Update Price if changed
        if (data.price) {
           const newPriceVal = parseFloat(data.price);
           const oldPriceVal = parseFloat(item.currentPrice || item.originalPrice);

           if (newPriceVal !== oldPriceVal) {
             updates.currentPrice = data.price;
             // Logic: If price dropped more than 5%
             if (newPriceVal < oldPriceVal * 0.95) {
               updates.dealFound = true;
               newAlert = { type: 'success', msg: `🔥 Price Drop! ${item.name} is now $${data.price}!` };
               dealsFoundCount++;
             } else if (newPriceVal > oldPriceVal) {
               updates.dealFound = false;
             }
           }
        }

        if (data.availability) {
          updates.availability = data.availability;
          if (data.availability.toLowerCase().includes('out')) {
             newAlert = { type: 'warn', msg: `⚠️ Stock Alert: ${item.name} is ${data.availability}` };
          }
        }

      } catch (error) {
        // --- FALLBACK SIMULATION ---
        if (!backendFailed) {
            backendFailed = true;
            setAlerts(prev => [...prev, { id: Date.now(), msg: "Backend unreachable. Switching to simulation mode.", type: 'warn', autoClose: true }]);
        }
        
        // Simulate waiting
        await new Promise(r => setTimeout(r, 500)); 

        // 10% chance stock change
        if (Math.random() > 0.9) {
             updates.availability = item.availability === 'In Stock' ? 'Out of Stock' : 'In Stock';
             if(updates.availability === 'Out of Stock') newAlert = { type: 'warn', msg: `⚠️ Sim Alert: ${item.name} is Out of Stock` };
        }
        
        // 20% chance deal found
        if (!item.dealFound && Math.random() > 0.8) {
            const discount = (parseFloat(item.originalPrice) * 0.85).toFixed(2);
            updates.currentPrice = discount;
            updates.dealFound = true;
            newAlert = { type: 'success', msg: `🔥 Sim Deal: ${item.name} is now $${discount}`, autoClose: false, itemId: item.id };
            dealsFoundCount++;
        }
      }

      // Apply Update
      if (Object.keys(updates).length > 1) {
        if (user) {
          try {
            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'wishlist_items', item.id), updates);
          } catch(e) { 
            console.error("Firestore update failed", e);
            // Fallback: update local state
            setItems(prev => prev.map(i => i.id === item.id ? { ...i, ...updates } : i));
          }
        } else {
          // Fallback: update local state
          setItems(prev => prev.map(i => i.id === item.id ? { ...i, ...updates } : i));
        }
      }

      if (newAlert) {
        setAlerts(prev => [...prev, { id: Date.now() + Math.random(), ...newAlert }]);
      }
    }

    setIsChecking(false);
    setStatusMessage('');
    if (dealsFoundCount === 0) {
      setAlerts(prev => [...prev, { id: Date.now(), msg: backendFailed ? "Simulation complete. No new deals." : "Scan complete. No new deals found.", type: 'info', autoClose: true }]);
    }
  };

  // 2. Auto-Fill from Link
  const handleAutoFill = async () => {
    if (!newItem.url) {
      setAlerts(prev => [...prev, { id: Date.now(), msg: "Please enter a URL first", type: 'warn', autoClose: true }]);
      return;
    }
    
    setIsAutoFilling(true);
    setStatusMessage('Agent analyzing link content...');
    setAlerts(prev => [...prev, { id: Date.now(), msg: "🔄 Connecting to backend server...", type: 'info', autoClose: true }]);

    try {
      console.log(`🔍 Auto-filling from URL: ${newItem.url}`);
      console.log(`📡 Backend URL: ${backendUrl}`);
      
      // CALL THE REAL BACKEND
      const response = await fetch(`${backendUrl}/api/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: newItem.url })
      });

      console.log(`📥 Response status: ${response.status}`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error("❌ Backend error:", errorData);
        throw new Error(errorData.error || `Server returned ${response.status}`);
      }

      const data = await response.json();
      console.log("✅ Extracted data:", data);

      if (!data.name && !data.price) {
        throw new Error("No product information found on this page");
      }

      setNewItem(prev => ({
        ...prev,
        store: data.store || prev.store || 'Other',
        name: data.name || prev.name || 'Imported Product',
        price: data.price || prev.price || '',
        imageUrl: data.imageUrl || prev.imageUrl || '',
        availability: data.availability || 'In Stock'
      }));

      setStatusMessage('✅ Details extracted successfully!');
      setAlerts(prev => [...prev, { id: Date.now(), msg: "✨ Product details extracted successfully!", type: 'success', autoClose: true }]);

    } catch (error) {
      console.error("❌ Auto-fill error:", error);
      
      // Check if it's a connection error
      if (error.message.includes('Failed to fetch') || error.message.includes('ERR_CONNECTION_REFUSED') || error.message.includes('NetworkError')) {
        setAlerts(prev => [...prev, { 
          id: Date.now(), 
          msg: `⚠️ Cannot connect to backend server at ${backendUrl}. Make sure server.js is running. Check Settings to configure backend URL.`, 
          type: 'warn',
          autoClose: true
        }]);
      } else {
        setAlerts(prev => [...prev, { 
          id: Date.now(), 
          msg: `⚠️ Auto-fill failed: ${error.message}. Using fallback mode.`,
          autoClose: true,
          type: 'warn',
          autoClose: true
        }]);
      }
      
      // --- FALLBACK SIMULATION ---
      await new Promise(r => setTimeout(r, 1000)); // Fake delay
      
      const lowerUrl = newItem.url.toLowerCase();
      let detectedStore = 'Other';
      let detectedName = 'Imported Product';
      let detectedImage = '';

      if (lowerUrl.includes('amazon') || lowerUrl.includes('amzn')) {
        detectedStore = 'Amazon';
        detectedName = 'Amazon Product';
        detectedImage = 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=200&q=80';
      } else if (lowerUrl.includes('target')) {
        detectedStore = 'Target';
        detectedName = 'Target Product';
        detectedImage = 'https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?auto=format&fit=crop&w=200&q=80';
      } else if (lowerUrl.includes('walmart')) {
        detectedStore = 'Walmart';
        detectedName = 'Walmart Product';
        detectedImage = 'https://images.unsplash.com/photo-1565958011703-44f9829ba187?auto=format&fit=crop&w=200&q=80';
      } else if (lowerUrl.includes('meijer')) {
        detectedStore = 'Meijer';
        detectedName = 'Meijer Product';
      } else if (lowerUrl.includes('lego')) {
        detectedStore = 'Lego';
        detectedName = 'Lego Product';
      }

      setNewItem(prev => ({
        ...prev,
        store: detectedStore,
        name: detectedName !== 'Imported Product' ? detectedName : prev.name,
        price: prev.price || (Math.random() * 50 + 10).toFixed(2),
        imageUrl: detectedImage || prev.imageUrl,
        availability: 'In Stock'
      }));
      
      setStatusMessage('⚠️ Using fallback mode - please fill in details manually');
    } finally {
      setIsAutoFilling(false);
      setTimeout(() => setStatusMessage(''), 5000);
    }
  };

  const saveSettings = () => {
    localStorage.setItem('dealhunter_backend', backendUrl);
    setView('list');
    setAlerts(prev => [...prev, { id: Date.now(), msg: "Backend configuration saved.", type: 'success', autoClose: true }]);
  };

  // Fetch alternative images from the URL
  const handleGetAlternativeImages = async () => {
    if (!newItem.url) {
      setAlerts(prev => [...prev, { id: Date.now(), msg: "Please enter a URL first", type: 'warn', autoClose: true }]);
      return;
    }

    setIsLoadingImages(true);
    setShowImageSelector(true);
    setAlerts(prev => [...prev, { id: Date.now(), msg: "🔄 Fetching alternative images...", type: 'info', autoClose: true }]);

    try {
      const response = await fetch(`${backendUrl}/api/get-images`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: newItem.url })
      });

      if (!response.ok) {
        throw new Error('Failed to fetch images');
      }

      const data = await response.json();
      const images = data.images || [];
      
      if (images.length === 0) {
        setAlerts(prev => [...prev, { id: Date.now(), msg: "No alternative images found", type: 'warn', autoClose: true }]);
      } else {
        setAlternativeImages(images);
        setAlerts(prev => [...prev, { id: Date.now(), msg: `Found ${images.length} image options`, type: 'success', autoClose: true }]);
      }
    } catch (error) {
      console.error("Error fetching images:", error);
      setAlerts(prev => [...prev, { id: Date.now(), msg: `Failed to fetch images: ${error.message}`, type: 'warn', autoClose: true }]);
      setShowImageSelector(false);
    } finally {
      setIsLoadingImages(false);
    }
  };

  const selectImage = (imageUrl) => {
    setNewItem(prev => ({ ...prev, imageUrl }));
    setShowImageSelector(false);
    setAlerts(prev => [...prev, { id: Date.now(), msg: "Image selected!", type: 'success', autoClose: true }]);
  };

  // Toggle dropdown for item details
  const toggleItemDetails = (itemId) => {
    setExpandedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  // Search for product across multiple retailers
  const searchProductOnline = async (item) => {
    if (!item.name) {
      setAlerts(prev => [...prev, { id: Date.now(), msg: "Product name required for search", type: 'warn', autoClose: true }]);
      return;
    }

    setIsSearching(prev => ({ ...prev, [item.id]: true }));
    setAlerts(prev => [...prev, { id: Date.now(), msg: `🔍 Searching for "${item.name}" across retailers...`, type: 'info', autoClose: true }]);

    try {
      const response = await fetch(`${backendUrl}/api/search-product`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productName: item.name, currentStore: item.store })
      });

      if (!response.ok) {
        throw new Error('Search failed');
      }

      const data = await response.json();
      const results = data.results || [];
      
      if (results.length === 0) {
        setAlerts(prev => [...prev, { id: Date.now(), msg: "No product results found", type: 'warn', autoClose: true }]);
      } else {
        setSearchResults(prev => ({ ...prev, [item.id]: results }));
        setAlerts(prev => [...prev, { id: Date.now(), msg: `✅ Found ${results.length} product sources`, type: 'success', autoClose: true }]);
      }
    } catch (error) {
      console.error("Search error:", error);
      setAlerts(prev => [...prev, { id: Date.now(), msg: "Failed to search for product. Make sure backend server is running.", type: 'warn', autoClose: true }]);
    } finally {
      setIsSearching(prev => ({ ...prev, [item.id]: false }));
    }
  };

  // --- Handlers (Standard) ---
  const handleAddItem = async (e) => {
    e.preventDefault();
    if (!newItem.name || !newItem.price) return;
    try {
      // Only try to save to Firebase if user exists, otherwise just show alert
      if (user) {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'wishlist_items'), {
          ...newItem,
          originalPrice: newItem.price,
          currentPrice: newItem.price,
          dealFound: false,
          lastChecked: new Date().toISOString(),
          createdAt: serverTimestamp(),
          createdBy: user.uid,
          status: 'active'
        });
      } else {
        // Fallback: add to local state if Firebase not available
        const localItem = {
          id: Date.now().toString(),
          ...newItem,
          originalPrice: newItem.price,
          currentPrice: newItem.price,
          dealFound: false,
          lastChecked: new Date().toISOString(),
          createdAt: { seconds: Math.floor(Date.now() / 1000) },
          status: 'active'
        };
        setItems(prev => [localItem, ...prev]);
        setAlerts(prev => [...prev, { id: Date.now(), msg: "Item added locally (Firebase not connected)", type: 'info', autoClose: true }]);
      }
      setNewItem({ name: '', url: '', price: '', store: 'Amazon', neededBy: '', local: false, notes: '', imageUrl: '', availability: 'In Stock' });
      setView('list');
      setEditingItemId(null);
    } catch (error) { console.error("Error adding item:", error); }
  };

  const handleEditItem = (item) => {
    setEditingItemId(item.id);
    setNewItem({
      name: item.name || '',
      url: item.url || '',
      price: item.currentPrice || item.originalPrice || '',
      store: item.store || 'Amazon',
      neededBy: item.neededBy || '',
      local: item.local || false,
      notes: item.notes || '',
      imageUrl: item.imageUrl || '',
      availability: item.availability || 'In Stock'
    });
    setView('edit');
  };

  const handleUpdateItem = async (e) => {
    e.preventDefault();
    if (!newItem.name || !newItem.price || !editingItemId) return;
    try {
      if (user) {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'wishlist_items', editingItemId), {
          name: newItem.name,
          url: newItem.url,
          price: newItem.price,
          currentPrice: newItem.price,
          store: newItem.store,
          neededBy: newItem.neededBy,
          local: newItem.local,
          notes: newItem.notes,
          imageUrl: newItem.imageUrl,
          availability: newItem.availability,
          lastChecked: new Date().toISOString()
        });
      } else {
        // Fallback: update local state
        setItems(prev => prev.map(i => 
          i.id === editingItemId 
            ? { ...i, ...newItem, currentPrice: newItem.price }
            : i
        ));
        setAlerts(prev => [...prev, { id: Date.now(), msg: "Item updated locally (Firebase not connected)", type: 'info', autoClose: true }]);
      }
      setNewItem({ name: '', url: '', price: '', store: 'Amazon', neededBy: '', local: false, notes: '', imageUrl: '', availability: 'In Stock' });
      setView('list');
      setEditingItemId(null);
      setAlerts(prev => [...prev, { id: Date.now(), msg: "Item updated successfully!", type: 'success', autoClose: true }]);
    } catch (error) {
      console.error("Error updating item:", error);
      setAlerts(prev => [...prev, { id: Date.now(), msg: "Failed to update item", type: 'warn', autoClose: true }]);
    }
  };

  const handleDelete = async (id) => { 
    if (confirm('Remove this item?')) {
      if (user) {
        try {
          await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'wishlist_items', id));
        } catch (error) {
          console.error("Delete error:", error);
        }
      } else {
        // Fallback: remove from local state
        setItems(prev => prev.filter(item => item.id !== id));
      }
    }
  };
  const markPurchased = async (item) => { 
    if (user) {
      try {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'wishlist_items', item.id), { status: item.status === 'purchased' ? 'active' : 'purchased' });
      } catch (error) {
        console.error("Update error:", error);
      }
    } else {
      // Fallback: update local state
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: i.status === 'purchased' ? 'active' : 'purchased' } : i));
    }
  };
  const getRetailerColor = (store) => { switch(store) { case 'Target': return 'text-red-600 bg-red-50'; case 'Walmart': return 'text-blue-600 bg-blue-50'; case 'Amazon': return 'text-orange-600 bg-orange-50'; default: return 'text-gray-600 bg-gray-50'; } };
  const sortedItems = useMemo(() => { const r = [...items]; r.sort((a,b) => (a.status===b.status?0:(a.status==='active'?-1:1))); return r; }, [items]);
  const urgentItems = useMemo(() => items.filter(i => i.neededBy && i.status!=='purchased' && new Date(i.neededBy) <= new Date(Date.now()+7*86400000)), [items]);

  // Show loading only if still initializing (not if Firebase failed)
  if (loading && !user) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto mb-2" />
          <p className="text-slate-600 text-sm">Initializing...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-20">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="bg-indigo-600 p-2 rounded-lg"><Gift className="w-5 h-5 text-white" /></div>
            <h1 className="font-bold text-lg text-slate-800 hidden sm:block">DealHunter</h1>
            {/* Firebase Status Indicator */}
            <div className={`flex items-center space-x-1 px-2 py-1 rounded-full text-xs font-medium ${
              firebaseStatus.connected && firebaseStatus.auth && firebaseStatus.firestore
                ? 'bg-green-100 text-green-700'
                : firebaseStatus.error
                ? 'bg-red-100 text-red-700'
                : 'bg-yellow-100 text-yellow-700'
            }`} title={`Firebase: ${firebaseStatus.connected && firebaseStatus.auth && firebaseStatus.firestore ? 'Connected' : firebaseStatus.error ? `Error: ${firebaseStatus.error}` : 'Connecting...'}`}>
              <div className={`w-2 h-2 rounded-full ${
                firebaseStatus.connected && firebaseStatus.auth && firebaseStatus.firestore
                  ? 'bg-green-500'
                  : firebaseStatus.error
                  ? 'bg-red-500'
                  : 'bg-yellow-500 animate-pulse'
              }`}></div>
              <span className="hidden md:inline">
                {firebaseStatus.connected && firebaseStatus.auth && firebaseStatus.firestore
                  ? 'Firebase ✓'
                  : firebaseStatus.error
                  ? 'Firebase ✗'
                  : 'Firebase...'}
              </span>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {view === 'list' && (
              <button onClick={checkPrices} disabled={isChecking} className={`flex items-center space-x-2 px-4 py-2 rounded-full font-medium transition-all ${isChecking ? 'bg-slate-100 text-slate-400' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'}`}>
                <RefreshCw className={`w-4 h-4 ${isChecking ? 'animate-spin' : ''}`} />
                <span className="hidden xs:inline">{isChecking ? 'Agent Working...' : 'Run Agent'}</span>
              </button>
            )}
             <button onClick={() => setView('settings')} className={`p-2 rounded-full ${view === 'settings' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>
              <Settings className="w-5 h-5" />
            </button>
            <button onClick={() => {
              if (view === 'add' || view === 'edit') {
                setView('list');
                setEditingItemId(null);
                setNewItem({ name: '', url: '', price: '', store: 'Amazon', neededBy: '', local: false, notes: '', imageUrl: '', availability: 'In Stock' });
              } else {
                setView('add');
              }
            }} className={`p-2 rounded-full transition-colors ${view === 'add' || view === 'edit' ? 'bg-slate-100 text-slate-600' : 'bg-indigo-600 text-white shadow-md'}`}>
              {view === 'add' || view === 'edit' ? <Search className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
            </button>
          </div>
        </div>
        {(statusMessage || isChecking) && <div className="bg-indigo-50 text-indigo-600 text-xs text-center py-1 font-medium animate-pulse">{statusMessage || 'Agent is active...'}</div>}
      </header>

      {/* Alerts */}
      <div className="fixed top-20 right-4 z-50 w-full max-w-sm space-y-2 pointer-events-none">
        {alerts.map(a => (
          <div key={a.id} className={`pointer-events-auto p-4 rounded-lg shadow-lg flex justify-between animate-in slide-in-from-right ${a.type==='warn'?'bg-orange-600':a.type==='info'?'bg-slate-700':'bg-green-600'} text-white`}>
            <div className="flex items-start space-x-2">
               {a.type==='warn' && <WifiOff className="w-4 h-4 mt-0.5" />}
               <p className="text-sm font-medium">{a.msg}</p>
            </div>
            <button onClick={() => setAlerts(p => p.filter(al => al.id !== a.id))}><Plus className="w-4 h-4 rotate-45" /></button>
          </div>
        ))}
      </div>

      <main className="max-w-3xl mx-auto p-4 space-y-6">
        
        {/* SETTINGS VIEW */}
        {view === 'settings' && (
           <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
             <h2 className="text-xl font-bold mb-4 flex items-center text-slate-800"><Server className="w-5 h-5 mr-2 text-indigo-600" /> Infrastructure Settings</h2>
             <div className="bg-blue-50 p-4 rounded-lg mb-4 text-sm text-blue-800">
               To use Agentic features, you must run the provided <code>server.js</code> file on your computer or a cloud host (like Render.com). <br/>
               If unreachable, the app will run in <b>Simulation Mode</b>.
             </div>
             <label className="block text-sm font-semibold text-slate-700 mb-1">Backend Agent URL</label>
             <input type="url" value={backendUrl} onChange={e => setBackendUrl(e.target.value)} className="w-full p-3 rounded-lg border border-slate-300 mb-4" placeholder="http://localhost:3001" />
             <div className="flex gap-3">
               <button onClick={() => setView('list')} className="flex-1 py-2 bg-slate-100 rounded-lg font-bold text-slate-600">Cancel</button>
               <button onClick={saveSettings} className="flex-1 py-2 bg-indigo-600 text-white rounded-lg font-bold">Save Configuration</button>
             </div>
           </div>
        )}

        {/* ADD/EDIT VIEW */}
        {(view === 'add' || view === 'edit') && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <h2 className="text-xl font-bold mb-6 flex items-center text-slate-800">
              {view === 'edit' ? <Edit2 className="w-5 h-5 mr-2 text-indigo-600" /> : <Plus className="w-5 h-5 mr-2 text-indigo-600" />}
              {view === 'edit' ? 'Edit Wish' : 'Add New Wish'}
            </h2>
            <form onSubmit={view === 'edit' ? handleUpdateItem : handleAddItem} className="space-y-4">
              <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100">
                <label className="block text-sm font-bold text-indigo-900 mb-2">1. Paste Product Link</label>
                <div className="flex space-x-2">
                  <div className="relative flex-1">
                    <ExternalLink className="absolute left-3 top-3.5 w-4 h-4 text-indigo-400" />
                    <input type="url" placeholder="https://amazon.com/..." className="w-full pl-10 p-3 rounded-lg border border-indigo-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white" value={newItem.url} onChange={e => setNewItem({...newItem, url: e.target.value})} />
                  </div>
                  <button type="button" onClick={handleAutoFill} disabled={!newItem.url || isAutoFilling} className={`px-4 py-2 rounded-lg font-bold flex items-center transition-all shadow-sm ${!newItem.url?'bg-white text-slate-300 cursor-not-allowed border border-slate-200':isAutoFilling?'bg-indigo-600 text-white':'bg-white text-indigo-600 hover:bg-indigo-50 border border-indigo-200'}`}>
                    {isAutoFilling ? <Loader2 className="w-5 h-5 animate-spin" /> : <Wand2 className="w-5 h-5" />}
                  </button>
                </div>
                <p className="text-[10px] text-indigo-600/70 mt-2 font-medium">✨ <strong>Important:</strong> Click the magic wand button (✨) to automatically extract product details. Don't submit the form until after clicking the wand!</p>
              </div>

              {(newItem.imageUrl || showImageSelector) && (
                <div className="space-y-3">
                  {newItem.imageUrl && (
                    <div className="flex flex-col items-center space-y-2">
                      <div className="relative group">
                        <img src={newItem.imageUrl} alt="Preview" className="h-32 w-32 object-contain rounded-lg border-2 border-indigo-200 bg-white p-2" />
                        <button type="button" onClick={() => setNewItem({...newItem, imageUrl: ''})} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity" title="Remove image"><Plus className="w-3 h-3 rotate-45" /></button>
                      </div>
                      <button 
                        type="button" 
                        onClick={handleGetAlternativeImages}
                        disabled={!newItem.url || isLoadingImages}
                        className="text-xs px-3 py-1.5 bg-indigo-100 text-indigo-700 rounded-lg font-medium hover:bg-indigo-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-1"
                      >
                        {isLoadingImages ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin" />
                            <span>Loading...</span>
                          </>
                        ) : (
                          <>
                            <ImageIcon className="w-3 h-3" />
                            <span>Get Other Images</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  {showImageSelector && alternativeImages.length > 0 && (
                    <div className="border border-slate-200 rounded-lg p-4 bg-slate-50">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-slate-700">Select an Image:</h3>
                        <button 
                          type="button"
                          onClick={() => {
                            setShowImageSelector(false);
                            setAlternativeImages([]);
                          }}
                          className="text-xs text-slate-500 hover:text-slate-700"
                        >
                          Close
                        </button>
                      </div>
                      <div className="grid grid-cols-3 gap-2 max-h-64 overflow-y-auto">
                        {alternativeImages.map((imgUrl, index) => (
                          <button
                            key={index}
                            type="button"
                            onClick={() => selectImage(imgUrl)}
                            className={`relative aspect-square rounded-lg border-2 overflow-hidden transition-all ${
                              newItem.imageUrl === imgUrl 
                                ? 'border-indigo-500 ring-2 ring-indigo-200' 
                                : 'border-slate-200 hover:border-indigo-300'
                            }`}
                          >
                            <img 
                              src={imgUrl} 
                              alt={`Option ${index + 1}`}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                e.target.style.display = 'none';
                              }}
                            />
                            {newItem.imageUrl === imgUrl && (
                              <div className="absolute inset-0 bg-indigo-500 bg-opacity-20 flex items-center justify-center">
                                <CheckCircle className="w-6 h-6 text-indigo-600" />
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="border-t border-slate-100 my-2"></div>
              <div><label className="block text-sm font-semibold text-slate-700 mb-1">Product Name</label><input type="text" className="w-full p-3 rounded-lg border border-slate-300" value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} required /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-semibold text-slate-700 mb-1">Store</label><select className="w-full p-3 rounded-lg border border-slate-300 bg-white" value={newItem.store} onChange={e => setNewItem({...newItem, store: e.target.value})}>{RETAILERS.map(r => <option key={r} value={r}>{r}</option>)}</select></div>
                <div><label className="block text-sm font-semibold text-slate-700 mb-1">Price ($)</label><input type="number" step="0.01" className="w-full p-3 rounded-lg border border-slate-300" value={newItem.price} onChange={e => setNewItem({...newItem, price: e.target.value})} required /></div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label className="block text-sm font-semibold text-slate-700 mb-1">Needed By</label><input type="date" className="w-full p-3 rounded-lg border border-slate-300" value={newItem.neededBy} onChange={e => setNewItem({...newItem, neededBy: e.target.value})} /></div>
                <div className="flex items-center pt-6"><label className="flex items-center space-x-3 cursor-pointer"><input type="checkbox" className="w-5 h-5 text-indigo-600 rounded" checked={newItem.local} onChange={e => setNewItem({...newItem, local: e.target.checked})} /><span className="text-sm font-medium text-slate-700">Available Locally?</span></label></div>
              </div>
              <div><label className="block text-sm font-semibold text-slate-700 mb-1">Notes</label><textarea className="w-full p-3 rounded-lg border border-slate-300" rows="2" value={newItem.notes} onChange={e => setNewItem({...newItem, notes: e.target.value})}></textarea></div>
              <div className="pt-2 flex gap-3">
                <button type="button" onClick={() => {
                  setView('list');
                  setEditingItemId(null);
                  setNewItem({ name: '', url: '', price: '', store: 'Amazon', neededBy: '', local: false, notes: '', imageUrl: '', availability: 'In Stock' });
                }} className="flex-1 py-3 px-4 bg-slate-100 text-slate-700 font-bold rounded-lg">Cancel</button>
                <button type="submit" className="flex-1 py-3 px-4 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700">
                  {view === 'edit' ? 'Update Wish' : 'Add to Wishlist'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* MAIN LIST VIEW */}
        {view === 'list' && (
          <div className="space-y-8">
            {urgentItems.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <h3 className="text-amber-800 font-bold flex items-center mb-3"><Clock className="w-5 h-5 mr-2" /> Arriving Soon / Birthday Watch</h3>
                <div className="flex gap-3 overflow-x-auto pb-2">{urgentItems.map(item => (
                  <div key={item.id} className="min-w-[200px] bg-white p-3 rounded-lg border border-amber-100 shadow-sm"><p className="font-semibold text-slate-800 truncate">{item.name}</p><p className="text-xs text-amber-600 font-medium mt-1">Needed by {new Date(item.neededBy).toLocaleDateString()}</p>{item.local && <span className="inline-flex items-center mt-2 px-2 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-700"><MapPin className="w-3 h-3 mr-1" /> Local Pickup</span>}</div>
                ))}</div>
              </div>
            )}
            <div className="grid gap-4">
              {sortedItems.length === 0 ? <div className="text-center py-12 text-slate-400"><ShoppingBag className="w-16 h-16 mx-auto mb-4 opacity-50" /><p>No wishes yet. Tap + to start adding!</p></div> : sortedItems.map(item => (
                <div key={item.id} className={`relative bg-white rounded-xl shadow-sm border border-slate-200 p-4 transition-all ${item.status === 'purchased' ? 'opacity-60 bg-slate-50' : 'hover:shadow-md'}`}>
                  {item.dealFound && item.status !== 'purchased' && <div className="absolute -top-3 -right-2 bg-green-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-sm flex items-center animate-bounce"><DollarSign className="w-3 h-3 mr-1" /> DEAL FOUND</div>}
                  <div className="flex items-start">
                    <div className="w-20 h-20 bg-slate-100 rounded-lg flex-shrink-0 mr-4 flex items-center justify-center overflow-hidden border border-slate-200">{item.imageUrl ? <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" /> : <ImageIcon className="w-8 h-8 text-slate-300" />}</div>
                    <div className="flex-1 pr-2">
                      <div className="flex items-center space-x-2 mb-1"><span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded ${getRetailerColor(item.store)}`}>{item.store}</span>{item.neededBy && <span className="text-[10px] text-slate-400 flex items-center"><Calendar className="w-3 h-3 mr-1" />{new Date(item.neededBy).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>}</div>
                      <h3 className={`font-bold text-lg text-slate-800 mb-1 leading-tight ${item.status === 'purchased' ? 'line-through decoration-slate-400' : ''}`}>{item.name}</h3>
                      <div className="flex flex-wrap items-center gap-2 text-sm mt-1">
                         {item.dealFound ? <div className="flex items-baseline space-x-2"><span className="text-green-600 font-bold text-lg">${item.currentPrice}</span><span className="text-slate-400 line-through text-xs">${item.originalPrice}</span></div> : <span className="text-slate-600 font-medium text-lg">${item.originalPrice}</span>}
                         {item.status !== 'purchased' && <span className={`text-[10px] px-2 py-0.5 rounded font-bold border ${item.availability?.includes('Out') ? 'bg-red-50 text-red-600 border-red-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}>{item.availability || 'In Stock'}</span>}
                      </div>
                      
                      {/* Prominent Deal Link */}
                      {item.dealFound && item.url && item.status !== 'purchased' && (
                        <a 
                          href={item.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          onClick={() => {
                            // Close any deal-related notifications for this item
                            setAlerts(prev => prev.filter(a => !(a.itemId === item.id && a.type === 'success' && a.msg.includes('Price Drop'))));
                          }}
                          className="mt-3 inline-flex items-center justify-center space-x-2 w-full py-2.5 px-4 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold rounded-lg shadow-lg hover:from-green-600 hover:to-emerald-700 transition-all transform hover:scale-105 active:scale-95"
                        >
                          <ExternalLink className="w-4 h-4" />
                          <span>View Deal - Save ${(parseFloat(item.originalPrice) - parseFloat(item.currentPrice || item.originalPrice)).toFixed(2)}</span>
                        </a>
                      )}
                      
                    </div>
                    <div className="flex flex-col space-y-2 pl-2 border-l border-slate-100 ml-2">
                       <button onClick={() => markPurchased(item)} className={`p-2 rounded-full transition-colors ${item.status === 'purchased' ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`} title={item.status === 'purchased' ? 'Mark as active' : 'Mark as purchased'}><CheckCircle className="w-5 h-5" /></button>
                       <button onClick={() => handleEditItem(item)} className="p-2 rounded-full bg-indigo-50 text-indigo-500 hover:bg-indigo-100 transition-colors" title="Edit item"><Edit2 className="w-5 h-5" /></button>
                       {item.url && <a href={item.url} target="_blank" rel="noopener noreferrer" className="p-2 rounded-full bg-blue-50 text-blue-500 hover:bg-blue-100 transition-colors" title="Open link"><ExternalLink className="w-5 h-5" /></a>}
                       <button onClick={() => handleDelete(item.id)} className="p-2 rounded-full bg-red-50 text-red-400 hover:bg-red-100 transition-colors" title="Delete item"><Trash2 className="w-5 h-5" /></button>
                    </div>
                  </div>

                  {/* Expandable Details Section */}
                  <div className="mt-3 border-t border-slate-200">
                    <button
                      onClick={() => toggleItemDetails(item.id)}
                      className="w-full flex items-center justify-between py-2 text-sm font-medium text-slate-700 hover:text-indigo-600 transition-colors"
                    >
                      <div className="flex items-center space-x-2">
                        <Info className="w-4 h-4" />
                        <span>Additional Information</span>
                      </div>
                      {expandedItems.has(item.id) ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>

                    {expandedItems.has(item.id) && (
                      <div className="pb-3 space-y-4 animate-in slide-in-from-top-2">
                        {/* Notes Section */}
                        {item.notes && (
                          <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                            <h4 className="text-xs font-bold text-slate-600 mb-1 uppercase tracking-wide">Notes</h4>
                            <p className="text-sm text-slate-700">{item.notes}</p>
                          </div>
                        )}

                        {/* Product Description - if stored */}
                        {item.description && (
                          <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                            <h4 className="text-xs font-bold text-blue-600 mb-1 uppercase tracking-wide">Description</h4>
                            <p className="text-sm text-blue-800">{item.description}</p>
                          </div>
                        )}

                        {/* Search for Online Sources */}
                        <div className="bg-indigo-50 rounded-lg p-3 border border-indigo-200">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="text-xs font-bold text-indigo-600 uppercase tracking-wide">Online Sources</h4>
                            {!searchResults[item.id] && (
                              <button
                                onClick={() => searchProductOnline(item)}
                                disabled={isSearching[item.id]}
                                className="text-xs px-3 py-1 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-1"
                              >
                                {isSearching[item.id] ? (
                                  <>
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    <span>Searching...</span>
                                  </>
                                ) : (
                                  <>
                                    <Search className="w-3 h-3" />
                                    <span>Search Online</span>
                                  </>
                                )}
                              </button>
                            )}
                          </div>

                          {searchResults[item.id] && searchResults[item.id].length > 0 && (
                            <div className="space-y-2 mt-3">
                              <p className="text-xs text-indigo-700 font-medium mb-2">Top {Math.min(searchResults[item.id].length, 10)} Product Sources:</p>
                              {searchResults[item.id].slice(0, 10).map((result, index) => (
                                <a
                                  key={index}
                                  href={result.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={`block p-3 rounded-lg border transition-all hover:shadow-sm ${
                                    result.isOriginal 
                                      ? 'bg-green-50 border-green-200 hover:bg-green-100' 
                                      : result.salePrice
                                      ? 'bg-emerald-50 border-emerald-200 hover:bg-emerald-100'
                                      : 'bg-white border-slate-200 hover:border-indigo-300'
                                  }`}
                                >
                                  <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                      <div className="flex items-center space-x-2 mb-1 flex-wrap">
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                          result.isOriginal 
                                            ? 'bg-green-600 text-white' 
                                            : getRetailerColor(result.retailer)
                                        }`}>
                                          {result.retailer}
                                        </span>
                                        {result.isOriginal && (
                                          <span className="text-[10px] text-green-600 font-medium">Original</span>
                                        )}
                                        {result.salePrice && (
                                          <div className="flex items-baseline space-x-1">
                                            <span className="text-sm font-bold text-emerald-600">${result.salePrice}</span>
                                            {result.originalPrice && (
                                              <span className="text-[10px] text-slate-400 line-through">${result.originalPrice}</span>
                                            )}
                                            <span className="text-[10px] text-emerald-600 font-semibold">SALE</span>
                                          </div>
                                        )}
                                        {!result.salePrice && result.price && (
                                          <span className="text-xs text-slate-700 font-semibold">${result.price}</span>
                                        )}
                                      </div>
                                      <p className="text-xs font-semibold text-slate-800 mb-1">{result.title}</p>
                                      {result.description && (
                                        <p className="text-[10px] text-slate-500">{result.description}</p>
                                      )}
                                    </div>
                                    <ExternalLink className="w-4 h-4 text-slate-400 ml-2 flex-shrink-0 mt-1" />
                                  </div>
                                </a>
                              ))}
                              <button
                                onClick={() => {
                                  setSearchResults(prev => {
                                    const newResults = { ...prev };
                                    delete newResults[item.id];
                                    return newResults;
                                  });
                                  searchProductOnline(item);
                                }}
                                className="text-xs text-indigo-600 hover:text-indigo-700 font-medium mt-2 flex items-center space-x-1"
                              >
                                <RefreshCw className="w-3 h-3" />
                                <span>Refresh Results</span>
                              </button>
                            </div>
                          )}

                          {!searchResults[item.id] && !isSearching[item.id] && (
                            <p className="text-xs text-indigo-600 mt-2">Click "Search Online" to find this product at other retailers.</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  {item.status !== 'purchased' && (
                    <div className={`mt-4 pt-3 border-t flex items-center justify-between text-xs ${item.dealFound ? 'border-green-200 bg-green-50 rounded-b-lg -mx-4 -mb-4 px-4 pb-3 text-green-700' : 'border-slate-100 text-slate-400'}`}>
                      <div className="flex items-center space-x-1">
                        <Clock className="w-3 h-3" />
                        <span>Last scan: {item.lastChecked ? new Date(item.lastChecked).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Never'}</span>
                      </div>
                      {item.local && <span className="flex items-center text-indigo-600 font-medium"><MapPin className="w-3 h-3 mr-1" /> Local Availability</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
      <footer className="py-6 text-center text-xs text-slate-400"><p>Family Wishlist Tracker • Agentic Infrastructure</p></footer>
    </div>
  );
}