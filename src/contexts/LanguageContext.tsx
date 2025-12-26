import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type Language = 'ms' | 'en';

interface Translations {
  // Common
  loading: string;
  exit: string;
  signOut: string;
  save: string;
  cancel: string;
  delete: string;
  edit: string;
  refresh: string;
  search: string;
  clearFilters: string;
  download: string;
  downloading: string;
  
  // Navigation
  studio: string;
  vault: string;
  admin: string;
  aiStudio: string;
  balance: string;
  video: string;
  videos: string;
  
  // Auth
  welcomeBack: string;
  letsRegister: string;
  loginToStudio: string;
  createAccount: string;
  username: string;
  email: string;
  password: string;
  loginNow: string;
  registerFree: string;
  noAccount: string;
  hasAccount: string;
  registerHere: string;
  loginHere: string;
  emailSent: string;
  emailSentDesc: string;
  checkSpam: string;
  backToLogin: string;
  termsAgreement: string;
  
  // SoraStudio
  visionPrompt: string;
  promptPlaceholder: string;
  limitReachedPlaceholder: string;
  characters: string;
  recommended: string;
  duration: string;
  aspectRatio: string;
  referenceImage: string;
  clickToUpload: string;
  uploading: string;
  uploaded: string;
  ugcGenerator: string;
  openaiApiKey: string;
  productName: string;
  productNamePlaceholder: string;
  productDescription: string;
  productDescPlaceholder: string;
  platform: string;
  character: string;
  female: string;
  male: string;
  saveProductData: string;
  generateUgcPrompt: string;
  generatingPrompt: string;
  dialogScript: string;
  segmentDetails: string;
  limitReached: string;
  contactAdmin: string;
  generateVideo: string;
  generating: string;
  waitVideoComplete: string;
  outputPreview: string;
  processingVision: string;
  progress: string;
  loadingVideo: string;
  videoNotAvailable: string;
  generationFailed: string;
  videoOutputHere: string;
  poweredBy: string;
  
  // Status
  processing: string;
  completed: string;
  ready: string;
  failed: string;
  active: string;
  pending: string;
  approved: string;
  
  // HistoryVault
  historyTitle: string;
  historySubtitle: string;
  syncComplete: string;
  recentVideos: string;
  allVideos: string;
  allStatus: string;
  allAspect: string;
  landscape: string;
  portrait: string;
  noVideos: string;
  checkStatus: string;
  gettingUrl: string;
  
  // Locked state
  accountNotApproved: string;
  accountNotApprovedTitle: string;
  accountNotApprovedDesc: string;
  videoLimitZero: string;
  videoLimitZeroDesc: string;
  waitingApproval: string;
  contactAdminWhatsApp: string;
  
  // Limit reached
  limitReachedTitle: string;
  limitReachedDesc: string;
  
  // AdminDashboard
  adminDashboard: string;
  manageUsers: string;
  totalUsers: string;
  approvedUsers: string;
  pendingUsers: string;
  totalVideos: string;
  searchPlaceholder: string;
  user: string;
  status: string;
  videosUsed: string;
  videoLimit: string;
  actions: string;
  approve: string;
  reject: string;
  noUsersFound: string;
  userApproved: string;
  userDeleted: string;
  limitUpdated: string;
  generated: string;
  
  // Sidebar
  accessId: string;
  remaining: string;
  used: string;
  total: string;
  
  // Toasts
  loginSuccess: string;
  welcomeBackToast: string;
  registerSuccess: string;
  welcomeToStudio: string;
  checkEmail: string;
  videoReady: string;
  videoFailed: string;
  downloadSuccess: string;
  downloadFailed: string;
  uploadSuccess: string;
  uploadFailed: string;
  generationStarted: string;
  generationError: string;
  pleaseLoginAgain: string;
  apiKeySaved: string;
  apiKeyDeleted: string;
  productDataSaved: string;
  promptGenerated: string;
  promptGenerationFailed: string;
}

const msTranslations: Translations = {
  // Common
  loading: 'Memuatkan...',
  exit: 'Keluar',
  signOut: 'Log Keluar',
  save: 'Simpan',
  cancel: 'Batal',
  delete: 'Padam',
  edit: 'Edit',
  refresh: 'Refresh',
  search: 'Cari',
  clearFilters: 'Buang Semua',
  download: 'Muat Turun',
  downloading: 'Memuat turun...',
  
  // Navigation
  studio: 'Studio',
  vault: 'Vault',
  admin: 'Admin',
  aiStudio: 'AI Studio',
  balance: 'Baki',
  video: 'Video',
  videos: 'Video',
  
  // Auth
  welcomeBack: 'Selamat Kembali!',
  letsRegister: 'Jom Daftar!',
  loginToStudio: 'Masuk ke studio AI korang',
  createAccount: 'Buat akaun baru dalam 30 saat je',
  username: 'Nama Pengguna',
  email: 'Alamat Email',
  password: 'Kata Laluan',
  loginNow: 'Masuk Sekarang',
  registerFree: 'Daftar Percuma',
  noAccount: 'Takde akaun lagi?',
  hasAccount: 'Dah ada akaun?',
  registerHere: 'Daftar sini!',
  loginHere: 'Log masuk!',
  emailSent: 'Email Pengesahan Dihantar!',
  emailSentDesc: 'Kami dah hantar link pengesahan ke',
  checkSpam: 'Check folder spam kalau tak jumpa.',
  backToLogin: 'Balik ke Log Masuk',
  termsAgreement: 'Dengan mendaftar, korang setuju dengan terma penggunaan kami',
  
  // SoraStudio
  visionPrompt: 'Prompt Video',
  promptPlaceholder: 'Terangkan scene video korang... Lagi detail lagi bagus hasilnya.',
  limitReachedPlaceholder: 'Had video dah habis. Hubungi admin untuk tambahan.',
  characters: 'karakter',
  recommended: 'Disyorkan: 50-500 karakter',
  duration: 'Tempoh',
  aspectRatio: 'Nisbah Aspek',
  referenceImage: 'Gambar Rujukan (Pilihan - Image to Video)',
  clickToUpload: 'Klik untuk upload gambar (I2V)',
  uploading: 'Memuat naik...',
  uploaded: 'Dah Upload',
  ugcGenerator: 'Penjana Prompt UGC',
  openaiApiKey: 'OpenAI API Key',
  productName: 'Nama Produk',
  productNamePlaceholder: 'Contoh: Serum Vitamin C',
  productDescription: 'Keterangan Produk',
  productDescPlaceholder: 'Terangkan produk korang, kelebihan, bahan utama...',
  platform: 'Platform',
  character: 'Watak',
  female: 'Perempuan',
  male: 'Lelaki',
  saveProductData: 'Simpan Data Produk',
  generateUgcPrompt: 'Jana Prompt UGC',
  generatingPrompt: 'Menjana Prompt...',
  dialogScript: 'Skrip Dialog (BM)',
  segmentDetails: 'Detail Segment (Setiap 3 Saat)',
  limitReached: 'Had Dicapai - Hubungi Admin',
  contactAdmin: 'Hubungi Admin',
  generateVideo: 'Jana Video',
  generating: 'Memulakan...',
  waitVideoComplete: 'Tunggu video siap',
  outputPreview: 'Preview Output',
  processingVision: 'Memproses video korang...',
  progress: 'Progress',
  loadingVideo: 'Memuatkan video...',
  videoNotAvailable: 'Video tak tersedia',
  generationFailed: 'Penjanaan gagal',
  videoOutputHere: 'Output video akan keluar kat sini',
  poweredBy: 'Dikuasakan oleh Sora 2.0',
  
  // Status
  processing: 'Memproses',
  completed: 'Siap',
  ready: 'Siap',
  failed: 'Gagal',
  active: 'Aktif',
  pending: 'Menunggu',
  approved: 'Diluluskan',
  
  // HistoryVault
  historyTitle: 'Vault Video',
  historySubtitle: 'Semua video yang korang dah jana',
  syncComplete: 'Sync selesai',
  recentVideos: 'Video Terkini',
  allVideos: 'Semua Video',
  allStatus: 'Semua Status',
  allAspect: 'Semua Nisbah',
  landscape: 'Landscape',
  portrait: 'Portrait',
  noVideos: 'Takde video lagi',
  checkStatus: 'Check Status',
  gettingUrl: 'Mendapatkan URL video...',
  
  // Locked state
  accountNotApproved: 'Akaun Belum Diluluskan',
  accountNotApprovedTitle: 'Akaun Belum Diluluskan',
  accountNotApprovedDesc: 'Akaun korang tengah tunggu kelulusan dari admin. Hubungi admin untuk percepatkan proses.',
  videoLimitZero: 'Had Video: 0',
  videoLimitZeroDesc: 'Korang belum ada had video. Hubungi admin untuk dapatkan had video.',
  waitingApproval: 'Menunggu Kelulusan',
  contactAdminWhatsApp: 'Hubungi Admin via WhatsApp',
  
  // Limit reached
  limitReachedTitle: 'Had Video Dah Habis',
  limitReachedDesc: 'Korang dah guna semua video. Korang masih boleh tengok dan download video yang dah dijana.',
  
  // AdminDashboard
  adminDashboard: 'Dashboard Admin',
  manageUsers: 'Urus pengguna & monitor penggunaan sistem',
  totalUsers: 'Jumlah Pengguna',
  approvedUsers: 'Diluluskan',
  pendingUsers: 'Menunggu',
  totalVideos: 'Video Dijana',
  searchPlaceholder: 'Cari ID, email atau username...',
  user: 'Pengguna',
  status: 'Status',
  videosUsed: 'Video Guna',
  videoLimit: 'Had Video',
  actions: 'Tindakan',
  approve: 'Lulus',
  reject: 'Tolak',
  noUsersFound: 'Takde pengguna dijumpai',
  userApproved: 'Pengguna dah diluluskan',
  userDeleted: 'Pengguna dah dipadam',
  limitUpdated: 'Had pengguna dah dikemaskini',
  generated: 'dijana',
  
  // Sidebar
  accessId: 'Akses ID',
  remaining: 'Baki Video',
  used: 'Guna',
  total: 'Total',
  
  // Toasts
  loginSuccess: 'Log masuk berjaya!',
  welcomeBackToast: 'Selamat kembali.',
  registerSuccess: 'Pendaftaran berjaya!',
  welcomeToStudio: 'Selamat datang ke Azmeer AI Studio.',
  checkEmail: 'Sila check email korang untuk pengesahan.',
  videoReady: 'Video dah siap!',
  videoFailed: 'Video gagal dijana',
  downloadSuccess: 'Video berjaya dimuat turun!',
  downloadFailed: 'Gagal memuat turun video',
  uploadSuccess: 'Gambar berjaya dimuat naik!',
  uploadFailed: 'Gagal memuat naik gambar',
  generationStarted: 'Penjanaan video dimulakan!',
  generationError: 'Gagal menjana video',
  pleaseLoginAgain: 'Sila log masuk semula',
  apiKeySaved: 'API Key disimpan!',
  apiKeyDeleted: 'API Key dipadam!',
  productDataSaved: 'Data produk disimpan!',
  promptGenerated: 'Prompt UGC berjaya dijana!',
  promptGenerationFailed: 'Gagal menjana prompt',
};

const enTranslations: Translations = {
  // Common
  loading: 'Loading...',
  exit: 'Exit',
  signOut: 'Sign Out',
  save: 'Save',
  cancel: 'Cancel',
  delete: 'Delete',
  edit: 'Edit',
  refresh: 'Refresh',
  search: 'Search',
  clearFilters: 'Clear All',
  download: 'Download',
  downloading: 'Downloading...',
  
  // Navigation
  studio: 'Studio',
  vault: 'Vault',
  admin: 'Admin',
  aiStudio: 'AI Studio',
  balance: 'Balance',
  video: 'Video',
  videos: 'Videos',
  
  // Auth
  welcomeBack: 'Welcome Back!',
  letsRegister: 'Join Us!',
  loginToStudio: 'Login to your AI studio',
  createAccount: 'Create an account in 30 seconds',
  username: 'Username',
  email: 'Email Address',
  password: 'Password',
  loginNow: 'Login Now',
  registerFree: 'Register Free',
  noAccount: "Don't have an account?",
  hasAccount: 'Already have an account?',
  registerHere: 'Register here!',
  loginHere: 'Login here!',
  emailSent: 'Verification Email Sent!',
  emailSentDesc: 'We have sent a verification link to',
  checkSpam: 'Check your spam folder if not found.',
  backToLogin: 'Back to Login',
  termsAgreement: 'By registering, you agree to our terms of use',
  
  // SoraStudio
  visionPrompt: 'Vision Prompt',
  promptPlaceholder: 'Describe your video scene in detail... The more specific, the better the result.',
  limitReachedPlaceholder: 'Video limit reached. Contact admin for more.',
  characters: 'characters',
  recommended: 'Recommended: 50-500 chars',
  duration: 'Duration',
  aspectRatio: 'Aspect Ratio',
  referenceImage: 'Reference Image (Optional - Image to Video)',
  clickToUpload: 'Click to upload reference (I2V)',
  uploading: 'Uploading...',
  uploaded: 'Uploaded',
  ugcGenerator: 'UGC Prompt Generator',
  openaiApiKey: 'OpenAI API Key',
  productName: 'Product Name',
  productNamePlaceholder: 'Example: Vitamin C Serum',
  productDescription: 'Product Description',
  productDescPlaceholder: 'Describe your product, benefits, key ingredients...',
  platform: 'Platform',
  character: 'Character',
  female: 'Female',
  male: 'Male',
  saveProductData: 'Save Product Data',
  generateUgcPrompt: 'Generate UGC Prompt',
  generatingPrompt: 'Generating Prompt...',
  dialogScript: 'Dialog Script',
  segmentDetails: 'Segment Details (Every 3 Seconds)',
  limitReached: 'Limit Reached - Contact Admin',
  contactAdmin: 'Contact Admin',
  generateVideo: 'Generate Video',
  generating: 'Starting...',
  waitVideoComplete: 'Wait for video to complete',
  outputPreview: 'Output Preview',
  processingVision: 'Processing your vision...',
  progress: 'Progress',
  loadingVideo: 'Loading video...',
  videoNotAvailable: 'Video not available',
  generationFailed: 'Generation failed',
  videoOutputHere: 'Video output will appear here',
  poweredBy: 'Powered by Sora 2.0',
  
  // Status
  processing: 'Processing',
  completed: 'Completed',
  ready: 'Ready',
  failed: 'Failed',
  active: 'Active',
  pending: 'Pending',
  approved: 'Approved',
  
  // HistoryVault
  historyTitle: 'Video Vault',
  historySubtitle: 'All videos you have generated',
  syncComplete: 'Sync complete',
  recentVideos: 'Recent Videos',
  allVideos: 'All Videos',
  allStatus: 'All Status',
  allAspect: 'All Aspect',
  landscape: 'Landscape',
  portrait: 'Portrait',
  noVideos: 'No videos yet',
  checkStatus: 'Check Status',
  gettingUrl: 'Getting video URL...',
  
  // Locked state
  accountNotApproved: 'Account Not Approved',
  accountNotApprovedTitle: 'Account Not Approved',
  accountNotApprovedDesc: 'Your account is waiting for admin approval. Contact admin to speed up the process.',
  videoLimitZero: 'Video Limit: 0',
  videoLimitZeroDesc: 'You have no video quota. Contact admin to get video quota.',
  waitingApproval: 'Waiting for Approval',
  contactAdminWhatsApp: 'Contact Admin via WhatsApp',
  
  // Limit reached
  limitReachedTitle: 'Video Limit Reached',
  limitReachedDesc: 'You have used all your videos. You can still view and download previously generated videos.',
  
  // AdminDashboard
  adminDashboard: 'Admin Dashboard',
  manageUsers: 'Manage users & monitor system usage',
  totalUsers: 'Total Users',
  approvedUsers: 'Approved',
  pendingUsers: 'Pending',
  totalVideos: 'Videos Generated',
  searchPlaceholder: 'Search ID, email or username...',
  user: 'User',
  status: 'Status',
  videosUsed: 'Videos Used',
  videoLimit: 'Video Limit',
  actions: 'Actions',
  approve: 'Approve',
  reject: 'Reject',
  noUsersFound: 'No users found',
  userApproved: 'User approved',
  userDeleted: 'User deleted',
  limitUpdated: 'User limit updated',
  generated: 'generated',
  
  // Sidebar
  accessId: 'Access ID',
  remaining: 'Videos Left',
  used: 'Used',
  total: 'Total',
  
  // Toasts
  loginSuccess: 'Login successful!',
  welcomeBackToast: 'Welcome back.',
  registerSuccess: 'Registration successful!',
  welcomeToStudio: 'Welcome to Azmeer AI Studio.',
  checkEmail: 'Please check your email for verification.',
  videoReady: 'Video is ready!',
  videoFailed: 'Video generation failed',
  downloadSuccess: 'Video downloaded successfully!',
  downloadFailed: 'Failed to download video',
  uploadSuccess: 'Image uploaded successfully!',
  uploadFailed: 'Failed to upload image',
  generationStarted: 'Video generation started!',
  generationError: 'Failed to generate video',
  pleaseLoginAgain: 'Please login again',
  apiKeySaved: 'API Key saved!',
  apiKeyDeleted: 'API Key deleted!',
  productDataSaved: 'Product data saved!',
  promptGenerated: 'UGC prompt generated!',
  promptGenerationFailed: 'Failed to generate prompt',
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: Translations;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem('app_language');
    return (saved as Language) || 'ms';
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('app_language', lang);
  };

  const t = language === 'ms' ? msTranslations : enTranslations;

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};

export type { Language, Translations };
