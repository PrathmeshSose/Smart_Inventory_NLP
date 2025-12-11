import React, { useState, useEffect, useRef } from 'react';
import { Search, Plus, Edit2, Trash2, Package, TrendingUp, AlertCircle, MessageSquare, Send, Sparkles, Mic, MicOff, Volume2, X, BarChart3 } from 'lucide-react';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE;

export default function SmartInventory() {
  const [items, setItems] = useState([]);               // start empty â€“ loaded from DB
  const [searchTerm, setSearchTerm] = useState('');
  const [nlpInput, setNlpInput] = useState('');
  const [chatHistory, setChatHistory] = useState([
    { type: 'assistant', text: 'Hi! I\'m your AI inventory assistant. Try asking me: "Show electronics", "Add 10 laptops", "What needs restocking?", or "Calculate total value"' }
  ]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [activeView, setActiveView] = useState('inventory');
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [filterCategory, setFilterCategory] = useState('all');
  const recognitionRef = useRef(null);
  const chatEndRef = useRef(null);

  const [formData, setFormData] = useState({
    name: '', category: '', quantity: '', price: '', minStock: ''
  });

  /* ------------------------------------------------------------------ */
  /* 1. Load items from backend on mount */
  /* ------------------------------------------------------------------ */
  useEffect(() => {
    fetchItems();
  }, []);

  const fetchItems = async () => {
  try {
    const { data } = await axios.get(`${API_BASE}/items`);
    const normalized = (data.data || []).map(it => ({
      ...it,
      id: it._id,
      quantity: Number(it.quantity) || 0,
      price: Number(it.price) || 0,
      minStock: Number(it.minStock) || 0,
    }));
    setItems(normalized);
  } catch (err) {
    console.error('Fetch failed', err);
    addChatMessage('assistant', 'Backend not reachable — is it running on port 5000?');
  }
};

  /* ------------------------------------------------------------------ */
  /* 2. Speech & UI helpers (unchanged) */
  /* ------------------------------------------------------------------ */
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = async (e) => {
        const txt = e.results[0][0].transcript;
        setNlpInput(txt);
        await processNLP(txt, 'voice');
        setIsListening(false);
      };
      recognitionRef.current.onerror = () => setIsListening(false);
      recognitionRef.current.onend = () => setIsListening(false);
    }
  }, []);

  const speak = (text) => {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();

  // Detect language (Marathi, Hindi, English)
  let detectedLang = 'en-IN';
  if (/[अ-ह|क-ळ|ऋ|१-९]+/.test(text)) detectedLang = 'mr-IN'; // Marathi
  else if (/[ा-ौ|क-ह|ँ|ं|ः]+/.test(text)) detectedLang = 'hi-IN'; // Hindi

  // strip emojis
  const cleanText = text.replace(
    /([\u2700-\u27BF]|[\uE000-\uF8FF]|\p{Emoji_Presentation}|\p{Extended_Pictographic})/gu,
    ''
  ).replace(/\s+/g, ' ').trim();

  const chunks = cleanText.match(/.{1,150}(\.|!|\?|$)/g) || [cleanText];

  const speakChunk = (index = 0) => {
    if (index >= chunks.length) {
      setIsSpeaking(false);
      return;
    }

    const utter = new SpeechSynthesisUtterance(chunks[index]);

    // Find correct voice
    const voices = window.speechSynthesis.getVoices();
    const voice =
      voices.find(v => v.lang === detectedLang) ||
      voices.find(v => v.lang.includes(detectedLang.split('-')[0])) ||
      voices.find(v => v.name.toLowerCase().includes('google')) ||
      voices[0];

    utter.voice = voice;
    utter.lang = detectedLang;

    utter.rate = 1;
    utter.pitch = 1;
    utter.volume = 1;

    utter.onstart = () => setIsSpeaking(true);
    utter.onend = () => speakChunk(index + 1);

    window.speechSynthesis.speak(utter);
  };

  // wait for browser voices to load
  if (window.speechSynthesis.getVoices().length === 0) {
    window.speechSynthesis.onvoiceschanged = () => speakChunk();
  } else {
    speakChunk();
  }
};



  const toggleListening = () => {
    if (isListening) recognitionRef.current?.stop();
    else recognitionRef.current?.start();
    setIsListening(!isListening);
  };

  const stopSpeaking = () => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  };

  const addChatMessage = (type, text) => {
    setChatHistory(p => [...p, { type, text }]);
  };

  /* ------------------------------------------------------------------ */
  /* 3. Gemini AI (backend) */
  /* ------------------------------------------------------------------ */
  // 🌐 AI Command Processor (New AI-driven backend)
const processNLP = async (input, origin = 'typed') => {
  if (!input.trim()) return;
  addChatMessage('user', input);
  setNlpInput('');

  try {
    const { data } = await axios.post(`${API_BASE}/ai/process`, { command: input });
    addChatMessage('assistant', data.message || 'No response from AI');
    if (origin === 'voice' || voiceEnabled) speak(data.message);
    fetchItems(); // refresh inventory after AI action
    return data;
  } catch (err) {
    console.error('AI Error:', err.response?.data || err.message);
    addChatMessage('assistant', 'AI error – check backend connection or Groq key');
    return null;
  }
};


  /* ------------------------------------------------------------------ */
  /* 4. CRUD â€“ all talk to backend */
  /* ------------------------------------------------------------------ */
  const handleAddItem = async () => {
    if (!formData.name || !formData.category || !formData.quantity || !formData.price) return;
    try {
      await axios.post(`${API_BASE}/inventory`, {
        name: formData.name,
        category: formData.category,
        quantity: Number(formData.quantity) || 0,
        price: Number(formData.price) || 0,
        minStock: Number(formData.minStock) || 0
      });
      setShowAddModal(false);
      setFormData({ name: '', category: '', quantity: '', price: '', minStock: '' });
      fetchItems();
      addChatMessage('assistant', `Added ${formData.name}`);
    } catch (err) { alert('Add failed'); }
  };

  const handleUpdateItem = async () => {
    try {
      await axios.put(`${API_BASE}/inventory/${editingItem.id}`, {
        name: editingItem.name,
        category: editingItem.category,
        quantity: Number(editingItem.quantity) || 0,
        price: Number(editingItem.price) || 0,
        minStock: Number(editingItem.minStock) || 0
      });
      setEditingItem(null);
      setShowAddModal(false);
      fetchItems();
      addChatMessage('assistant', `Updated ${editingItem.name}`);
    } catch (err) { alert('Update failed'); }
  };

  const handleDeleteItem = async (id) => {
    if (!confirm('Delete this item?')) return;
    try {
      await axios.delete(`${API_BASE}/inventory/${id}`);
      fetchItems();
      addChatMessage('assistant', 'Item deleted');
    } catch (err) { alert('Delete failed'); }
  };

  /* ------------------------------------------------------------------ */
  /* 5. Sorting / filtering (unchanged) */
  /* ------------------------------------------------------------------ */
  const handleSort = (key) => {
    let dir = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') dir = 'desc';
    setSortConfig({ key, direction: dir });
  };

  const getSortedItems = (arr) => {
    if (!sortConfig.key) return arr;
    return [...arr].sort((a, b) => {
      if (a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === 'asc' ? -1 : 1;
      if (a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  };

  const getFilteredItems = () => {
    let f = items.filter(i =>
      i.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      i.category.toLowerCase().includes(searchTerm.toLowerCase())
    );
    if (filterCategory !== 'all') f = f.filter(i => i.category === filterCategory);
    return getSortedItems(f);
  };

  const filteredItems = getFilteredItems();
  const categories = [...new Set(items.map(i => i.category))];
  const totalValue = items.reduce((s, i) => s + i.quantity * i.price, 0);
  const lowStockCount = items.filter(i => i.quantity < i.minStock).length;

  /* ------------------------------------------------------------------ */
  /* 6. UI â€“ 100 % unchanged */
  /* ------------------------------------------------------------------ */
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 relative overflow-hidden">
      {/* ==== Animated Background (unchanged) ==== */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-20 w-96 h-96 bg-yellow-400 rounded-full mix-blend-multiply filter blur-3xl opacity-40 animate-pulse"></div>
        <div className="absolute top-40 right-20 w-96 h-96 bg-green-400 rounded-full mix-blend-multiply filter blur-3xl opacity-40 animate-pulse" style={{animationDelay: '2s'}}></div>
        <div className="absolute bottom-20 left-40 w-96 h-96 bg-cyan-400 rounded-full mix-blend-multiply filter blur-3xl opacity-40 animate-pulse" style={{animationDelay: '4s'}}></div>
        <div className="absolute top-1/2 left-1/2 w-96 h-96 bg-rose-400 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-pulse" style={{animationDelay: '1s'}}></div>

        <div className="absolute top-10 left-10 animate-bounce" style={{animationDuration: '3s'}}><Package className="text-yellow-300 opacity-30" size={40} /></div>
        <div className="absolute top-32 right-40 animate-bounce" style={{animationDuration: '4s', animationDelay: '1s'}}><TrendingUp className="text-green-300 opacity-30" size={35} /></div>
        <div className="absolute bottom-40 left-20 animate-bounce" style={{animationDuration: '3.5s', animationDelay: '0.5s'}}><AlertCircle className="text-pink-300 opacity-30" size={45} /></div>
        <div className="absolute bottom-20 right-20 animate-bounce" style={{animationDuration: '4.5s', animationDelay: '2s'}}><Sparkles className="text-cyan-300 opacity-30" size={38} /></div>
        <div className="absolute top-1/2 right-10 animate-bounce" style={{animationDuration: '3.8s', animationDelay: '1.5s'}}><MessageSquare className="text-purple-300 opacity-30" size={42} /></div>
        <div className="absolute top-1/3 left-1/4 animate-bounce" style={{animationDuration: '4.2s', animationDelay: '0.8s'}}><BarChart3 className="text-indigo-300 opacity-30" size={36} /></div>

        <div className="absolute top-1/4 left-1/3 w-20 h-20 bg-gradient-to-br from-orange-400 to-red-400 rounded-lg opacity-20 animate-spin" style={{animationDuration: '10s'}}></div>
        <div className="absolute bottom-1/4 right-1/3 w-24 h-24 bg-gradient-to-br from-blue-400 to-indigo-400 rounded-full opacity-20 animate-spin" style={{animationDuration: '15s'}}></div>
        <div className="absolute top-1/2 left-1/2 w-16 h-16 bg-gradient-to-br from-green-400 to-emerald-400 opacity-20 animate-ping" style={{animationDuration: '8s'}}></div>
      </div>

      {/* ==== Header ==== */}
      <div className="bg-gradient-to-r from-orange-400/90 via-rose-400/90 to-purple-500/90 backdrop-blur-xl shadow-2xl border-b-4 border-yellow-300 relative z-10">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-br from-yellow-400 to-orange-500 p-3 rounded-2xl shadow-2xl transform hover:scale-125 hover:rotate-12 transition-all duration-300 animate-pulse">
                <MessageSquare className="text-white" size={28} />
              </div>
              <div>
                <h1 className="text-4xl font-black bg-gradient-to-r from-yellow-200 via-white to-cyan-200 bg-clip-text text-transparent drop-shadow-lg">
                  Smart Inventory AI
                </h1>
                <p className="text-sm font-bold text-yellow-100 drop-shadow">NLP + Voice-Powered Management</p>
              </div>
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              className="bg-gradient-to-r from-yellow-400 via-orange-500 to-red-500 text-white px-6 py-3 rounded-2xl flex items-center gap-2 hover:shadow-2xl transform hover:scale-110 transition-all duration-300 font-bold border-2 border-yellow-300 hover:border-white"
            >
              <Plus size={20} />
              <span>Add Item</span>
            </button>
          </div>
        </div>
      </div>

      {/* ==== Dashboard Cards ==== */}
      <div className="max-w-7xl mx-auto px-4 py-8 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-gradient-to-br from-cyan-400 to-blue-600 rounded-3xl shadow-2xl p-6 border-2 border-cyan-200 hover:shadow-cyan-500/50 transform hover:scale-110 hover:rotate-2 transition-all duration-300 group relative overflow-hidden">
            <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-10 transition-opacity"></div>
            <div className="flex items-center justify-between relative z-10">
              <div><p className="text-cyan-100 text-sm font-bold uppercase tracking-wide">Total Items</p><p className="text-5xl font-black text-white mt-1 drop-shadow-lg">{items.length}</p></div>
              <div className="bg-white/30 backdrop-blur-sm p-4 rounded-2xl group-hover:rotate-12 group-hover:scale-110 transition-transform shadow-xl"><Package className="text-white drop-shadow-lg" size={32} /></div>
            </div>
          </div>
          <div className="bg-gradient-to-br from-emerald-400 to-green-600 rounded-3xl shadow-2xl p-6 border-2 border-emerald-200 hover:shadow-emerald-500/50 transform hover:scale-110 hover:rotate-2 transition-all duration-300 group relative overflow-hidden">
            <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-10 transition-opacity"></div>
            <div className="flex items-center justify-between relative z-10">
              <div><p className="text-emerald-100 text-sm font-bold uppercase tracking-wide">Total Value</p><p className="text-5xl font-black text-white mt-1 drop-shadow-lg">${totalValue.toFixed(2)}</p></div>
              <div className="bg-white/30 backdrop-blur-sm p-4 rounded-2xl group-hover:rotate-12 group-hover:scale-110 transition-transform shadow-xl"><TrendingUp className="text-white drop-shadow-lg" size={32} /></div>
            </div>
          </div>
          <div className="bg-gradient-to-br from-rose-400 to-pink-600 rounded-3xl shadow-2xl p-6 border-2 border-rose-200 hover:shadow-rose-500/50 transform hover:scale-110 hover:rotate-2 transition-all duration-300 group relative overflow-hidden">
            <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-10 transition-opacity"></div>
            <div className="flex items-center justify-between relative z-10">
              <div><p className="text-rose-100 text-sm font-bold uppercase tracking-wide">Low Stock</p><p className="text-5xl font-black text-white mt-1 drop-shadow-lg">{lowStockCount}</p></div>
              <div className="bg-white/30 backdrop-blur-sm p-4 rounded-2xl group-hover:rotate-12 group-hover:scale-110 transition-transform shadow-xl"><AlertCircle className="text-white drop-shadow-lg" size={32} /></div>
            </div>
          </div>
          <div className="bg-gradient-to-br from-amber-400 to-orange-600 rounded-3xl shadow-2xl p-6 border-2 border-amber-200 hover:shadow-amber-500/50 transform hover:scale-110 hover:rotate-2 transition-all duration-300 group relative overflow-hidden">
            <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-10 transition-opacity"></div>
            <div className="flex items-center justify-between relative z-10">
              <div><p className="text-amber-100 text-sm font-bold uppercase tracking-wide">Categories</p><p className="text-5xl font-black text-white mt-1 drop-shadow-lg">{categories.length}</p></div>
              <div className="bg-white/30 backdrop-blur-sm p-4 rounded-2xl group-hover:rotate-12 group-hover:scale-110 transition-transform shadow-xl"><BarChart3 className="text-white drop-shadow-lg" size={32} /></div>
            </div>
          </div>
        </div>

        {/* ==== View Switcher ==== */}
        <div className="flex gap-4 mb-6 flex-wrap">
          <button onClick={() => setActiveView('inventory')} className={`px-6 py-3 rounded-2xl font-bold transition-all duration-300 transform hover:scale-105 border-2 ${activeView === 'inventory' ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-2xl shadow-cyan-500/50 border-cyan-200 scale-105' : 'bg-white/90 text-gray-700 hover:bg-gradient-to-r hover:from-cyan-100 hover:to-blue-100 border-cyan-300'}`}>Inventory View</button>
          <button onClick={() => setActiveView('chat')} className={`px-6 py-3 rounded-2xl font-bold transition-all duration-300 flex items-center gap-2 transform hover:scale-105 border-2 ${activeView === 'chat' ? 'bg-gradient-to-r from-purple-500 to-pink-600 text-white shadow-2xl shadow-purple-500/50 border-purple-200 scale-105' : 'bg-white/90 text-gray-700 hover:bg-gradient-to-r hover:from-purple-100 hover:to-pink-100 border-purple-300'}`}><Sparkles size={18} />AI Chat</button>
          <button onClick={() => setActiveView('voice')} className={`px-6 py-3 rounded-2xl font-bold transition-all duration-300 flex items-center gap-2 transform hover:scale-105 border-2 ${activeView === 'voice' ? 'bg-gradient-to-r from-orange-500 to-red-600 text-white shadow-2xl shadow-orange-500/50 border-orange-200 scale-105' : 'bg-white/90 text-gray-700 hover:bg-gradient-to-r hover:from-orange-100 hover:to-red-100 border-orange-300'}`}><Mic size={18} />Voice AI</button>
        </div>

        {/* ==== INVENTORY VIEW ==== */}
        {activeView === 'inventory' ? (
          <>
            <div className="mb-6 flex gap-4 flex-wrap">
              <div className="relative flex-1 min-w-[300px]">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                <input type="text" placeholder="Search inventory..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-12 pr-4 py-4 border-2 border-purple-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white/90 backdrop-blur-sm font-medium" />
              </div>
              <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="px-6 py-4 border-2 border-purple-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white/90 backdrop-blur-sm font-semibold">
                <option value="all">All Categories</option>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div className="bg-white/90 backdrop-blur-sm rounded-3xl shadow-2xl overflow-hidden border-4 border-purple-300">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gradient-to-r from-purple-600 via-pink-600 to-indigo-600 text-white">
                    <tr>
                      <th onClick={() => handleSort('name')} className="px-6 py-5 text-left text-sm font-black cursor-pointer hover:bg-purple-700 uppercase tracking-wide">Item Name {sortConfig.key === 'name' && (sortConfig.direction === 'asc' ? 'up' : 'down')}</th>
                      <th onClick={() => handleSort('category')} className="px-6 py-5 text-left text-sm font-black cursor-pointer hover:bg-purple-700 uppercase tracking-wide">Category {sortConfig.key === 'category' && (sortConfig.direction === 'asc' ? 'up' : 'down')}</th>
                      <th onClick={() => handleSort('quantity')} className="px-6 py-5 text-left text-sm font-black cursor-pointer hover:bg-purple-700 uppercase tracking-wide">Quantity {sortConfig.key === 'quantity' && (sortConfig.direction === 'asc' ? 'up' : 'down')}</th>
                      <th onClick={() => handleSort('price')} className="px-6 py-5 text-left text-sm font-black cursor-pointer hover:bg-purple-700 uppercase tracking-wide">Price {sortConfig.key === 'price' && (sortConfig.direction === 'asc' ? 'up' : 'down')}</th>
                      <th className="px-6 py-5 text-left text-sm font-black uppercase tracking-wide">Value</th>
                      <th className="px-6 py-5 text-left text-sm font-black uppercase tracking-wide">Status</th>
                      <th className="px-6 py-5 text-left text-sm font-black uppercase tracking-wide">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredItems.map(item => (
                      <tr key={item.id} className="hover:bg-gradient-to-r hover:from-purple-100 hover:to-pink-100 transition-all duration-300">
                        <td className="px-6 py-4 font-bold text-gray-900">{item.name}</td>
                        <td className="px-6 py-4"><span className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-full text-sm font-bold shadow-lg">{item.category}</span></td>
                        <td className="px-6 py-4"><span className={`font-black text-lg ${item.quantity < item.minStock ? 'text-pink-600' : 'text-green-600'}`}>{item.quantity}</span></td>
                        <td className="px-6 py-4 text-gray-900 font-bold">${(Number(item.price) || 0).toFixed(2)}</td>
                        <td className="px-6 py-4 text-gray-900 font-bold">${(Number(item.quantity) * Number(item.price) || 0).toFixed(2)}</td>
                        <td className="px-6 py-4">
                          {item.quantity < item.minStock ? (
                            <span className="px-4 py-2 bg-gradient-to-r from-pink-500 to-red-600 text-white rounded-full text-sm font-bold flex items-center gap-1 w-fit shadow-lg"><AlertCircle size={14} />Low Stock</span>
                          ) : (
                            <span className="px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-full text-sm font-bold shadow-lg">In Stock</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex gap-2">
                            <button onClick={() => setEditingItem(item)} className="p-3 text-white bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-600 hover:to-blue-700 rounded-xl transition-all shadow-lg transform hover:scale-110"><Edit2 size={18} /></button>
                            <button onClick={() => handleDeleteItem(item.id)} className="p-3 text-white bg-gradient-to-r from-pink-500 to-red-600 hover:from-pink-600 hover:to-red-700 rounded-xl transition-all shadow-lg transform hover:scale-110"><Trash2 size={18} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : activeView === 'chat' ? (
          /* ==== CHAT VIEW (unchanged) ==== */
          <div className="bg-white/90 backdrop-blur-sm rounded-3xl shadow-2xl border-4 border-purple-300 overflow-hidden">
            <div className="h-96 overflow-y-auto p-6 space-y-4 bg-gradient-to-br from-purple-50/50 to-indigo-50/50">
              {chatHistory.map((m, i) => (
                <div key={i} className={`flex ${m.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-lg px-5 py-4 rounded-2xl whitespace-pre-line shadow-lg ${m.type === 'user' ? 'bg-gradient-to-r from-purple-600 via-pink-600 to-indigo-600 text-white font-semibold' : 'bg-white border-2 border-purple-300 text-gray-800 font-medium'}`}>
                    {m.text}
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <div className="p-5 bg-gradient-to-r from-purple-100 to-pink-100 backdrop-blur-sm border-t-4 border-purple-300">
              <div className="flex gap-3">
                <input type="text" value={nlpInput} onChange={e => setNlpInput(e.target.value)} onKeyPress={e => e.key === 'Enter' && nlpInput.trim() && processNLP(nlpInput)} placeholder="Ask me anything about your inventory..." className="flex-1 px-5 py-4 border-2 border-purple-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium" />
                <button onClick={() => nlpInput.trim() && processNLP(nlpInput)} className="bg-gradient-to-r from-purple-600 via-pink-600 to-indigo-600 text-white px-8 py-4 rounded-2xl hover:shadow-2xl transform hover:scale-110 transition-all duration-300 flex items-center gap-2 font-bold"><Send size={20} /></button>
              </div>
            </div>
          </div>
        ) : (
          /* ==== VOICE VIEW (unchanged) ==== */
          <div className="space-y-6">
            <div className="bg-gradient-to-br from-pink-100 via-purple-100 to-indigo-100 rounded-3xl shadow-2xl border-4 border-purple-300 p-12 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-96 h-96 bg-purple-400 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-pulse"></div>
              <div className="absolute bottom-0 right-0 w-96 h-96 bg-pink-400 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-pulse" style={{animationDelay: '3s'}}></div>
              <div className="flex flex-col items-center justify-center relative z-10">
                <div className="relative mb-8">
                  <div className={`w-48 h-48 rounded-full bg-gradient-to-br from-pink-500 via-purple-500 to-indigo-600 flex items-center justify-center shadow-2xl transition-all duration-500 ${isListening ? 'animate-pulse scale-110' : isSpeaking ? 'animate-pulse' : 'hover:scale-110'}`}>
                    <div className="w-40 h-40 rounded-full bg-white flex items-center justify-center shadow-inner">
                      {isListening ? <div className="relative"><Mic className="text-pink-600 animate-pulse" size={64} /><div className="absolute inset-0 rounded-full border-4 border-pink-400 animate-ping"></div></div>
                        : isSpeaking ? <div className="flex gap-2"><div className="w-2 h-12 bg-purple-600 rounded-full animate-bounce"></div><div className="w-2 h-16 bg-purple-600 rounded-full animate-bounce" style={{animationDelay: '150ms'}}></div><div className="w-2 h-12 bg-purple-600 rounded-full animate-bounce" style={{animationDelay: '300ms'}}></div></div>
                        : <Volume2 className="text-purple-600 animate-pulse" size={64} />}
                    </div>
                  </div>
                  {(isListening || isSpeaking) && (<><div className="absolute inset-0 rounded-full border-4 border-purple-400 opacity-50 animate-ping"></div><div className="absolute inset-0 rounded-full border-4 border-pink-400 opacity-30 animate-ping" style={{animationDelay: '0.5s'}}></div></>)}
                </div>

                <h2 className="text-4xl font-black mb-4 bg-gradient-to-r from-pink-600 via-purple-600 to-indigo-600 bg-clip-text text-transparent">{isListening ? "I'm Listening..." : isSpeaking ? 'Speaking...' : 'Ready to Assist'}</h2>
                <p className="text-gray-700 mb-8 text-center max-w-md font-semibold">{isListening ? 'Speak now to ask about your inventory' : isSpeaking ? 'Playing your response' : 'Click the microphone button below and ask me anything about your inventory'}</p>

                <div className="flex flex-col items-center gap-6 w-full max-w-md">
                  <div className="flex gap-4">
                    <button onClick={toggleListening} disabled={isSpeaking} className={`px-8 py-4 rounded-2xl transition-all duration-300 flex items-center gap-3 font-black text-lg shadow-2xl transform hover:scale-110 border-2 ${isListening ? 'bg-gradient-to-r from-red-500 to-pink-500 text-white animate-pulse border-red-300' : 'bg-gradient-to-r from-pink-600 via-purple-600 to-indigo-600 text-white hover:shadow-purple-500/50 border-purple-300'} ${isSpeaking ? 'opacity-50 cursor-not-allowed' : ''}`}>
                      {isListening ? <MicOff size={24} /> : <Mic size={24} />}
                      <span>{isListening ? 'Stop Listening' : 'Start Voice Input'}</span>
                    </button>
                    {isSpeaking && <button onClick={stopSpeaking} className="px-8 py-4 rounded-2xl bg-gradient-to-r from-orange-500 to-red-500 text-white transition-all duration-300 flex items-center gap-3 font-black text-lg shadow-2xl hover:shadow-orange-500/50 transform hover:scale-110 border-2 border-orange-300"><Volume2 size={24} />Stop Speaking</button>}
                  </div>

                  <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-5 shadow-xl border-2 border-purple-300 w-full">
                    <label className="flex items-center justify-center gap-3 cursor-pointer">
                      <input type="checkbox" checked={voiceEnabled} onChange={e => setVoiceEnabled(e.target.checked)} className="w-6 h-6 text-purple-600 rounded focus:ring-purple-500" />
                      <span className="font-bold text-gray-700 flex items-center gap-2"><Volume2 size={20} />Enable AI Voice Responses</span>
                    </label>
                  </div>

                  <div className="w-full">
                    <p className="text-sm text-gray-700 mb-3 text-center font-black uppercase tracking-wide">Try saying:</p>
                    <div className="grid grid-cols-2 gap-3">
                      {['"Show me all electronics"', '"Check low stock items"', '"What\'s the total value?"', '"List furniture items"'].map((c, i) => (
                        <div key={i} className="bg-gradient-to-br from-purple-100 to-pink-100 backdrop-blur-sm rounded-xl p-3 text-center text-sm text-gray-700 font-semibold border-2 border-purple-300 hover:border-purple-500 hover:shadow-xl transform hover:scale-105 transition-all duration-300 cursor-pointer">{c}</div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white/90 backdrop-blur-sm rounded-3xl shadow-2xl border-4 border-purple-300 overflow-hidden">
              <div className="bg-gradient-to-r from-pink-600 via-purple-600 to-indigo-600 p-5"><h3 className="text-white font-black text-xl flex items-center gap-2"><MessageSquare />Voice Conversation History</h3></div>
              <div className="h-64 overflow-y-auto p-6 space-y-4 bg-gradient-to-br from-purple-50 to-pink-50">
                {chatHistory.map((m, i) => (
                  <div key={i} className={`flex ${m.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-lg px-5 py-4 rounded-2xl whitespace-pre-line shadow-lg ${m.type === 'user' ? 'bg-gradient-to-r from-pink-600 via-purple-600 to-indigo-600 text-white font-bold' : 'bg-gradient-to-r from-purple-100 to-indigo-100 text-gray-800 border-2 border-purple-300 font-semibold'}`}>{m.text}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ==== ADD / EDIT MODAL (unchanged) ==== */}
      {(showAddModal || editingItem) && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-gradient-to-br from-white to-purple-50 rounded-3xl shadow-2xl max-w-md w-full p-8 border-4 border-purple-300 relative">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-3xl font-black bg-gradient-to-r from-purple-600 via-pink-600 to-indigo-600 bg-clip-text text-transparent">{editingItem ? 'Edit Item' : 'Add New Item'}</h2>
              <button onClick={() => { setShowAddModal(false); setEditingItem(null); setFormData({ name: '', category: '', quantity: '', price: '', minStock: '' }); }} className="p-2 hover:bg-red-100 rounded-xl transition-all border-2 border-transparent hover:border-red-500"><X size={24} className="text-red-600" /></button>
            </div>

            <div className="space-y-4">
              <input type="text" placeholder="Item Name" value={editingItem ? editingItem.name : formData.name} onChange={e => editingItem ? setEditingItem({ ...editingItem, name: e.target.value }) : setFormData({ ...formData, name: e.target.value })} className="w-full px-5 py-4 border-2 border-purple-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-purple-500 font-semibold" />
              <input type="text" placeholder="Category" value={editingItem ? editingItem.category : formData.category} onChange={e => editingItem ? setEditingItem({ ...editingItem, category: e.target.value }) : setFormData({ ...formData, category: e.target.value })} className="w-full px-5 py-4 border-2 border-purple-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-purple-500 font-semibold" />
              <input type="number" placeholder="Quantity" value={editingItem ? editingItem.quantity : formData.quantity} onChange={e => editingItem ? setEditingItem({ ...editingItem, quantity: parseInt(e.target.value) || 0 }) : setFormData({ ...formData, quantity: e.target.value })} className="w-full px-5 py-4 border-2 border-purple-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-purple-500 font-semibold" />
              <input type="number" step="0.01" placeholder="Price" value={editingItem ? editingItem.price : formData.price} onChange={e => editingItem ? setEditingItem({ ...editingItem, price: parseFloat(e.target.value) || 0 }) : setFormData({ ...formData, price: e.target.value })} className="w-full px-5 py-4 border-2 border-purple-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-purple-500 font-semibold" />
              <input type="number" placeholder="Minimum Stock Level" value={editingItem ? editingItem.minStock : formData.minStock} onChange={e => editingItem ? setEditingItem({ ...editingItem, minStock: parseInt(e.target.value) || 0 }) : setFormData({ ...formData, minStock: e.target.value })} className="w-full px-5 py-4 border-2 border-purple-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-purple-500 font-semibold" />
            </div>

            <div className="flex gap-4 mt-6">
              <button onClick={() => { setShowAddModal(false); setEditingItem(null); setFormData({ name: '', category: '', quantity: '', price: '', minStock: '' }); }} className="flex-1 px-6 py-4 border-2 border-gray-400 text-gray-700 rounded-2xl hover:bg-gray-100 font-black transition-all transform hover:scale-105">Cancel</button>
              <button onClick={editingItem ? handleUpdateItem : handleAddItem} className="flex-1 px-6 py-4 bg-gradient-to-r from-purple-600 via-pink-600 to-indigo-600 text-white rounded-2xl hover:shadow-2xl font-black transform hover:scale-105 transition-all border-2 border-purple-300">{editingItem ? 'Update' : 'Add'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
