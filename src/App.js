import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';

// Firebase imports
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithEmailAndPassword, // Import untuk login email/password
  createUserWithEmailAndPassword, // Import untuk register email/password
  signOut, 
  onAuthStateChanged 
} from 'firebase/auth'; 
import { getFirestore, collection, query, where, onSnapshot, doc, addDoc, updateDoc, getDocs } from 'firebase/firestore';


// Inisialisasi Firebase DENGAN KONFIGURASI PROYEK ANDA
const firebaseConfig = {
  apiKey: "AIzaSyDq9QJgy8MsBBT_aa8Grs0qB9Fkv0rPVXc", // <--- API KEY ANDA
  authDomain: "ziyanmart-24e66.firebaseapp.com",       // <--- AUTH DOMAIN ANDA
  databaseURL: "https://ziyanmart-24e66-default-rtdb.asia-southeast1.firebasedatabase.app", // <--- DATABASE URL ANDA (Opsional, tapi tidak mengganggu)
  projectId: "ziyanmart-24e66",                       // <--- PROJECT ID ANDA
  storageBucket: "ziyanmart-24e66.firebasestorage.app", // <--- STORAGE BUCKET ANDA
  messagingSenderId: "240946719713",               // <--- MESSAGING SENDER ID ANDA
  appId: "1:240946719713:web:7229803cf05a81ec4cc0a0", // <--- APP ID ANDA
  measurementId: "G-HR6XM4N5SF"                   // Ini opsional, bisa dihapus jika tidak digunakan
};

// Ambil appId dari konfigurasi Firebase Anda (akan menjadi "ziyanmart-24e66")
const appId = firebaseConfig.projectId;

// Inisialisasi Firebase
let app;
try {
    app = initializeApp(firebaseConfig);
} catch (e) {
    console.error("Firebase app already initialized or config missing. Error:", e);
}

const db = getFirestore(app);
const auth = getAuth(app);


// Komponen utama aplikasi
function App() {
  const [activeTab, setActiveTab] = useState('daily');
  const [user, setUser] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false); // State untuk switch antara login/register
  const [email, setEmail] = useState(''); // State untuk input email
  const [password, setPassword] = useState(''); // State untuk input password


  // Refs for PDF export
  const laporanRef = useRef();

  // State untuk menyimpan respons AI
  const [geminiReminderText, setGeminiReminderText] = useState('');
  const [isGeneratingReminder, setIsGeneratingReminder] = useState(false);
  const [geminiAnalysisText, setGeminiAnalysisText] = useState('');
  const [isGeneratingAnalysis, setIsGeneratingAnalysis] = useState(false);


  // --- Fungsi pembantu untuk memformat tanggal (YYYY-MM-DD menjadi DD/MM/YYYY) ---
  const formatDate = useCallback((dateString) => {
    if (!dateString) return 'N/A';
    try {
      const [year, month, day] = dateString.split('-');
      const dateObj = new Date(year, month - 1, day);
      if (isNaN(dateObj.getTime())) {
        return 'Invalid Date';
      }
      return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(dateObj);
    } catch (e) {
      console.error("Error formatting date:", dateString, e);
      return 'N/A';
    }
  }, []);

  // --- Fungsi pembantu untuk memformat angka menjadi format mata uang Rupiah ---
  const formatCurrency = useCallback((amount) => {
    if (typeof amount !== 'number' || isNaN(amount)) return 'Rp. 0';
    return amount.toLocaleString('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  }, []);

  // --- Fungsi pembantu baru: Memformat angka dengan pemisah ribuan tanpa simbol mata uang ---
  const formatNumberWithThousandsSeparator = useCallback((amount) => {
    // Convert to number first to ensure proper formatting
    const num = typeof amount === 'string' ? parseCurrency(amount) : amount;
    if (typeof num !== 'number' || isNaN(num)) return '';
    // Use Intl.NumberFormat to handle thousands separators
    return num.toLocaleString('id-ID', { maximumFractionDigits: 0 });
  }, []); // parseCurrency is needed here to handle string inputs like "1.000" or "1000"

  // --- Fungsi pembantu untuk mengubah string mata uang menjadi angka ---
  const parseCurrency = useCallback((formattedString) => {
    if (!formattedString) return 0;
    // Menghapus 'Rp.', spasi, dan semua tanda titik ribuan. Mengganti koma desimal dengan titik.
    const cleanedString = String(formattedString).replace(/Rp\.\s?|\./g, '').replace(/,/g, '.');
    return parseFloat(cleanedString) || 0;
  }, []);


  // State untuk Pencatatan Harian
  const [dailyRecords, setDailyRecords] = useState([]);
  const [newDailyEntry, setNewDailyEntry] = useState({
    tanggal: '',
    bakiSemalam: 0,
    saldoHariIni: 0,
    uangSimpan: 0,
    penjualanTunaiCalculated: 0,
    detailedExpenses: [],
    salesPayments: [],
  });

  const [saldoHariIniInputDisplay, setSaldoHariIniInputDisplay] = useState('');
  const [uangSimpanInputDisplay, setUangSimpanInputDisplay] = useState('');
  const [currentExpenseDescription, setCurrentExpenseDescription] = useState('');
  const [currentExpenseAmount, setCurrentExpenseAmount] = useState(0);
  const [currentExpenseAmountDisplay, setCurrentExpenseAmountDisplay] = useState('');
  const [currentSalesPaymentInvoiceNo, setCurrentSalesPaymentInvoiceNo] = useState('');
  const [currentSalesPaymentAmount, setCurrentSalesPaymentAmount] = useState(0); 
  const [currentSalesPaymentAmountDisplay, setCurrentSalesPaymentAmountDisplay] = useState('');
  const [currentSalesPaymentReturnPotongan, setCurrentSalesPaymentReturnPotongan] = useState(0);
  const [currentSalesPaymentReturnPotonganDisplay, setCurrentSalesPaymentReturnPotonganDisplay] = useState('');

  // State untuk Manajemen Hutang
  const [incomingGoodsDebtRecords, setIncomingGoodsDebtRecords] = useState([]);
  const [newHutangEntry, setNewHutangEntry] = useState({
    tanggalHutang: '',
    tempo: '',
    noInvoice: '',
    namaSales: '',
    jumlahBarangMasuk: 0,
    note: '',
  });
  const [jumlahBarangMasukInputDisplay, setJumlahBarangMasukInputDisplay] = useState('');

  const [modalMessage, setModalMessage] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedInvoiceForHistory, setSelectedInvoiceForHistory] = useState(null);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [selectedDailyRecordForDetails, setSelectedDailyRecordForDetails] = useState(null);
  const [isDailyDetailModalOpen, setIsDailyDetailModalOpen] = useState(false);
  const [editingDailyRecordId, setEditingDailyRecordId] = useState(null);
  const [editingHutangEntryId, setEditingHutangEntryId] = useState(null);

  // --- Logika Modal & Laporan ---
  const showModal = useCallback((message) => {
    setModalMessage(message);
    setIsModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    setModalMessage('');
  }, []);

  const showHistoryModal = useCallback((invoice) => {
    setSelectedInvoiceForHistory(invoice);
    setIsHistoryModalOpen(true);
  }, []);

  const closeHistoryModal = useCallback(() => {
    setSelectedInvoiceForHistory(null);
    setIsHistoryModalOpen(false);
  }, []);

  const showDailyDetailModal = useCallback((record) => {
    setSelectedDailyRecordForDetails(record);
    setIsDailyDetailModalOpen(true);
  }, []);

  const closeDailyDetailModal = useCallback(() => {
    setSelectedDailyRecordForDetails(null);
    setIsDailyDetailModalOpen(false);
  }, []);


  // --- Firebase Authentication Effect (Modified for Email/Password) ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        setUserId(currentUser.uid);
        // Clear forms on successful login
        setEmail('');
        setPassword('');
      } else {
        setUser(null);
        setUserId(null);
        // Clear form values if user logs out or not authenticated
        setEmail('');
        setPassword('');
      }
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []); 


  // --- Firestore Data Fetching Effects ---
  useEffect(() => {
    if (!isAuthReady || !userId) {
      // Jika tidak ada user atau auth belum siap, bersihkan data lokal
      setDailyRecords([]);
      setIncomingGoodsDebtRecords([]);
      return;
    }

    // Catatan Harian
    const dailyRef = collection(db, `artifacts/${appId}/users/${userId}/dailyRecords`);
    const qDaily = query(dailyRef);
    const unsubscribeDaily = onSnapshot(qDaily, (snapshot) => {
      const records = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
                                    .sort((a, b) => new Date(a.tanggal) - new Date(b.tanggal));
      setDailyRecords(records);
    }, (error) => {
      console.error("Error fetching daily records:", error);
      showModal("Gagal memuat catatan harian. Silakan coba lagi.");
    });

    // Catatan Hutang
    const debtRef = collection(db, `artifacts/${appId}/users/${userId}/incomingGoodsDebtRecords`);
    const qDebt = query(debtRef);
    const unsubscribeDebt = onSnapshot(qDebt, (snapshot) => {
      const records = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setIncomingGoodsDebtRecords(records);
    }, (error) => {
      console.error("Error fetching debt records:", error);
      showModal("Gagal memuat catatan hutang. Silakan coba lagi.");
    });

    return () => {
      unsubscribeDaily();
      unsubscribeDebt();
    };
  }, [isAuthReady, userId, showModal]);


  // --- Efek untuk menghitung Saldo/Baki Semalam otomatis (Diperbarui untuk Hari Libur) ---
  useEffect(() => {
    if (newDailyEntry.tanggal && dailyRecords.length > 0) {
        const currentDate = new Date(newDailyEntry.tanggal);
        currentDate.setHours(0, 0, 0, 0); // Normalisasi ke awal hari

        // Sortir record dari yang terbaru ke terlama untuk mencari tanggal sebelumnya
        const sortedRecords = [...dailyRecords].sort((a, b) => new Date(b.tanggal).getTime() - new Date(a.tanggal).getTime());

        let prevDayRecord = null;
        for (let i = 0; i < sortedRecords.length; i++) {
            const recordDate = new Date(sortedRecords[i].tanggal);
            recordDate.setHours(0, 0, 0, 0); // Normalisasi ke awal hari

            // Cari record yang tanggalnya sebelum tanggal saat ini (newDailyEntry.tanggal)
            if (recordDate < currentDate) {
                prevDayRecord = sortedRecords[i];
                break; // Hentikan pencarian setelah menemukan record terdekat sebelumnya
            }
        }

        if (prevDayRecord) {
            const calculatedBakiSemalam = prevDayRecord.saldoHariIni - prevDayRecord.uangSimpan;
            setNewDailyEntry(prev => ({
                ...prev,
                bakiSemalam: calculatedBakiSemalam,
            }));
        } else {
            // Jika tidak ada record sebelumnya, baki semalam adalah 0
            setNewDailyEntry(prev => ({
                ...prev,
                bakiSemalam: 0,
            }));
        }
    } else {
        // Jika tidak ada tanggal yang dipilih atau tidak ada record sama sekali, baki semalam adalah 0
        setNewDailyEntry(prev => ({
            ...prev,
            bakiSemalam: 0,
        }));
    }
}, [newDailyEntry.tanggal, dailyRecords, editingDailyRecordId]);


  // --- Perhitungan Otomatis untuk Pencatatan Harian ---
  const totalDetailedExpenses = useMemo(() => {
    return newDailyEntry.detailedExpenses.reduce((sum, exp) => sum + exp.amount, 0);
  }, [newDailyEntry.detailedExpenses]);

  const totalSalesPaymentsForDaily = useMemo(() => {
    return newDailyEntry.salesPayments.reduce((sum, payment) => sum + payment.amount + (payment.returnPotongan || 0), 0);
  }, [newDailyEntry.salesPayments]);

  const calculatedDailyData = useMemo(() => {
    const totalPengeluaranHarian = totalDetailedExpenses + totalSalesPaymentsForDaily;
    const penjualanTunaiCalculated =
      newDailyEntry.saldoHariIni +
      newDailyEntry.uangSimpan +
      totalPengeluaranHarian -
      newDailyEntry.bakiSemalam;

    return { totalPengeluaranHarian, penjualanTunaiCalculated };
  }, [
    newDailyEntry.bakiSemalam,
    newDailyEntry.saldoHariIni,
    newDailyEntry.uangSimpan,
    totalDetailedExpenses,
    totalSalesPaymentsForDaily,
  ]);


  // --- Efek untuk menginisialisasi tampilan input numerik dengan pemisah ribuan ---
  useEffect(() => {
    setSaldoHariIniInputDisplay(formatNumberWithThousandsSeparator(newDailyEntry.saldoHariIni));
    setUangSimpanInputDisplay(formatNumberWithThousandsSeparator(newDailyEntry.uangSimpan));
    setCurrentExpenseAmountDisplay(formatNumberWithThousandsSeparator(currentExpenseAmount));
    setCurrentSalesPaymentAmountDisplay(formatNumberWithThousandsSeparator(currentSalesPaymentAmount));
    setCurrentSalesPaymentReturnPotonganDisplay(formatNumberWithThousandsSeparator(currentSalesPaymentReturnPotongan));
    setJumlahBarangMasukInputDisplay(formatNumberWithThousandsSeparator(newHutangEntry.jumlahBarangMasuk));
  }, [
    newDailyEntry.saldoHariIni, newDailyEntry.uangSimpan,
    currentExpenseAmount, currentSalesPaymentAmount, currentSalesPaymentReturnPotongan,
    newHutangEntry.jumlahBarangMasuk,
    formatNumberWithThousandsSeparator
  ]);


  // --- Handler untuk Input Terformat ---
  // Digunakan untuk state yang merupakan bagian dari objek (e.g., newDailyEntry.saldoHariIni)
  const handleObjectNumericInputChange = useCallback((e, setDisplayState, setObjectState, fieldName) => {
    const rawValue = e.target.value;
    const numericValue = parseCurrency(rawValue); // Parse string input ke nilai numerik
    
    // Tampilkan nilai yang diformat dengan pemisah ribuan saat mengetik
    setDisplayState(formatNumberWithThousandsSeparator(rawValue)); 
    
    // Simpan nilai numerik aktual ke state objek
    setObjectState(prev => ({
      ...prev,
      [fieldName]: numericValue,
    }));
  }, [parseCurrency, formatNumberWithThousandsSeparator]);

  // Digunakan untuk state numerik langsung (e.g., currentExpenseAmount)
  const handleDirectNumericInputChange = useCallback((e, setDisplayState, setNumericState) => {
    const rawValue = e.target.value;
    const numericValue = parseCurrency(rawValue); // Parse string input ke nilai numerik

    // Tampilkan nilai yang diformat dengan pemisah ribuan saat mengetik
    setDisplayState(formatNumberWithThousandsSeparator(rawValue));
    
    // Simpan nilai numerik aktual ke state
    setNumericState(numericValue);
  }, [parseCurrency, formatNumberWithThousandsSeparator]);

  // Saat input kehilangan fokus, terapkan format mata uang lengkap (Rp.)
  const handleFormattedInputBlur = useCallback((e, valueToFormat, setDisplayState) => {
    setDisplayState(formatCurrency(valueToFormat));
  }, [formatCurrency]);

  // Saat input mendapatkan fokus, tampilkan angka dengan pemisah ribuan (tanpa Rp.)
  const handleFormattedInputFocus = useCallback((e, valueToDisplay, setDisplayState) => {
    e.target.select();
    // Tampilkan nilai yang diformat dengan pemisah ribuan, agar lebih mudah diedit
    setDisplayState(formatNumberWithThousandsSeparator(valueToDisplay));
  }, [formatNumberWithThousandsSeparator]);


  // --- Logika Pencatatan Harian ---
  const addDetailedExpense = () => {
    if (currentExpenseDescription && currentExpenseAmount > 0) {
      setNewDailyEntry(prev => ({
        ...prev,
        detailedExpenses: [
          ...prev.detailedExpenses,
          { description: currentExpenseDescription, amount: currentExpenseAmount }
        ]
      }));
      setCurrentExpenseDescription('');
      setCurrentExpenseAmount(0);
      setCurrentExpenseAmountDisplay('');
    } else {
      showModal('Deskripsi dan jumlah pengeluaran harus diisi dan jumlah harus lebih dari 0.');
    }
  };

  const removeDetailedExpense = (indexToRemove) => {
    setNewDailyEntry(prev => ({
      ...prev,
      detailedExpenses: prev.detailedExpenses.filter((_, index) => index !== indexToRemove)
    }));
  };

  const addSalesPaymentToDaily = async () => {
    if (!userId) { showModal("Autentikasi belum siap. Mohon tunggu."); return; }

    if (currentSalesPaymentInvoiceNo && (currentSalesPaymentAmount > 0 || currentSalesPaymentReturnPotongan > 0)) {
      const invoice = incomingGoodsDebtRecords.find(inv => inv.noInvoice === currentSalesPaymentInvoiceNo);
      if (!invoice) {
        showModal('Nomor Invoice tidak ditemukan.');
        return;
      }
      const totalAmountApplied = currentSalesPaymentAmount + currentSalesPaymentReturnPotongan;
      if (totalAmountApplied > invoice.sisaHutang) {
        showModal(`Total pembayaran & potongan (${formatCurrency(totalAmountApplied)}) melebihi sisa hutang (${formatCurrency(invoice.sisaHutang)}) untuk invoice ${currentSalesPaymentInvoiceNo}.`);
        return;
      }

      setNewDailyEntry(prev => ({
        ...prev,
        salesPayments: [
          ...prev.salesPayments,
          {
            invoiceNo: currentSalesPaymentInvoiceNo,
            amount: currentSalesPaymentAmount,
            returnPotongan: currentSalesPaymentReturnPotongan
          }
        ]
      }));

      // Perbarui sisa hutang di Firestore
      const debtDocRef = doc(db, `artifacts/${appId}/users/${userId}/incomingGoodsDebtRecords`, invoice.id);
      const newSisaHutang = invoice.sisaHutang - totalAmountApplied;
      const updatedPayments = [
        ...(invoice.payments || []),
        {
          tanggalPembayaran: newDailyEntry.tanggal || new Date().toISOString().split('T')[0],
          jumlahBayar: currentSalesPaymentAmount,
          potongan: currentSalesPaymentReturnPotongan
        }
      ];
      const newStatus = newSisaHutang <= 0 ? 'Lunas' : (newSisaHutang < invoice.jumlahBarangMasuk ? 'Lunas Sebagian' : 'Belum Lunas');

      try {
        await updateDoc(debtDocRef, {
          sisaHutang: newSisaHutang,
          payments: updatedPayments,
          statusPembayaran: newStatus
        });
      } catch (error) {
        console.error("Error updating debt record in Firestore:", error);
        showModal("Gagal memperbarui hutang di database.");
      }

      setCurrentSalesPaymentInvoiceNo('');
      setCurrentSalesPaymentAmount(0);
      setCurrentSalesPaymentAmountDisplay('');
      setCurrentSalesPaymentReturnPotongan(0);
      setCurrentSalesPaymentReturnPotonganDisplay('');
    } else {
      showModal('Nomor Invoice, jumlah pembayaran, atau potongan harus diisi (setidaknya satu dari jumlah pembayaran atau potongan harus lebih dari 0).');
    }
  };

  const removeSalesPaymentFromDaily = async (indexToRemove) => {
    if (!userId) { showModal("Autentikasi belum siap. Mohon tunggu."); return; }

    const payment = newDailyEntry.salesPayments[indexToRemove];
    if (payment) {
      const invoice = incomingGoodsDebtRecords.find(inv => inv.noInvoice === payment.invoiceNo);
      if (!invoice) {
        showModal('Invoice terkait tidak ditemukan di catatan hutang.');
        return;
      }

      // Kembalikan sisa hutang di Firestore
      const debtDocRef = doc(db, `artifacts/${appId}/users/${userId}/incomingGoodsDebtRecords`, invoice.id);
      const newSisaHutang = invoice.sisaHutang + payment.amount + payment.returnPotongan;

      const updatedPaymentsHistory = (invoice.payments || []).filter(
        (p, idx) => !(p.jumlahBayar === payment.amount && p.potongan === payment.returnPotongan && p.tanggalPembayaran === (newDailyEntry.tanggal || new Date().toISOString().split('T')[0]))
      );
      const newStatus = newSisaHutang >= invoice.jumlahBarangMasuk ? 'Belum Lunas' : (newSisaHutang > 0 ? 'Lunas Sebagian' : 'Lunas');

      try {
        await updateDoc(debtDocRef, {
          sisaHutang: newSisaHutang,
          payments: updatedPaymentsHistory,
          statusPembayaran: newStatus
        });
      } catch (error) {
        console.error("Error reverting debt record in Firestore:", error);
        showModal("Gagal mengembalikan hutang di database.");
      }

      setNewDailyEntry(prev => ({
        ...prev,
        salesPayments: prev.salesPayments.filter((_, index) => index !== indexToRemove)
      }));
    }
  };

  const addOrUpdateDailyEntry = async () => {
    if (!userId) { showModal("Autentikasi belum siap. Mohon tunggu."); return; }
    if (!newDailyEntry.tanggal) {
      showModal('Tanggal harus diisi untuk pencatatan harian.');
      return;
    }

    const dataToSave = {
      tanggal: newDailyEntry.tanggal,
      bakiSemalam: newDailyEntry.bakiSemalam,
      saldoHariIni: newDailyEntry.saldoHariIni,
      uangSimpan: newDailyEntry.uangSimpan,
      penjualanTunaiCalculated: calculatedDailyData.penjualanTunaiCalculated,
      detailedExpenses: newDailyEntry.detailedExpenses,
      salesPayments: newDailyEntry.salesPayments,
      totalPengeluaranHarian: calculatedDailyData.totalPengeluaranHarian,
    };

    try {
      if (editingDailyRecordId) {
        const docRef = doc(db, `artifacts/${appId}/users/${userId}/dailyRecords`, editingDailyRecordId);
        await updateDoc(docRef, dataToSave);
        showModal("Catatan harian berhasil diperbarui!");
      } else {
        const q = query(collection(db, `artifacts/${appId}/users/${userId}/dailyRecords`), where("tanggal", "==", newDailyEntry.tanggal));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
            showModal('Sudah ada catatan untuk tanggal ini. Harap pilih tanggal lain atau edit catatan yang sudah ada.');
            return;
        }

        await addDoc(collection(db, `artifacts/${appId}/users/${userId}/dailyRecords`), dataToSave);
        showModal("Catatan harian berhasil disimpan!");
      }
    } catch (error) {
      console.error("Error saving/updating daily record:", error);
      showModal("Gagal menyimpan atau memperbarui catatan harian. Silakan coba lagi.");
    }

    resetDailyForm();
  };

  const resetDailyForm = () => {
    setNewDailyEntry({
      tanggal: '', bakiSemalam: 0, saldoHariIni: 0, uangSimpan: 0, penjualanTunaiCalculated: 0,
      detailedExpenses: [], salesPayments: [],
    });
    setSaldoHariIniInputDisplay('');
    setUangSimpanInputDisplay('');
    setCurrentExpenseDescription('');
    setCurrentExpenseAmount(0); setCurrentExpenseAmountDisplay('');
    setCurrentSalesPaymentInvoiceNo('');
    setCurrentSalesPaymentAmount(0); setCurrentSalesPaymentAmountDisplay('');
    setCurrentSalesPaymentReturnPotongan(0); setCurrentSalesPaymentReturnPotonganDisplay('');
    setEditingDailyRecordId(null);
  };

  const handleEditDailyEntry = (recordId) => {
    const recordToEdit = dailyRecords.find(record => record.id === recordId);
    if (recordToEdit) {
      setEditingDailyRecordId(recordId);
      setNewDailyEntry({
        tanggal: recordToEdit.tanggal,
        bakiSemalam: recordToEdit.bakiSemalam,
        saldoHariIni: recordToEdit.saldoHariIni,
        uangSimpan: recordToEdit.uangSimpan,
        penjualanTunaiCalculated: recordToEdit.penjualanTunaiCalculated,
        detailedExpenses: [...recordToEdit.detailedExpenses],
        salesPayments: [...recordToEdit.salesPayments],
      });
      setSaldoHariIniInputDisplay(formatNumberWithThousandsSeparator(recordToEdit.saldoHariIni));
      setUangSimpanInputDisplay(formatNumberWithThousandsSeparator(recordToEdit.uangSimpan));
      setCurrentExpenseDescription(''); setCurrentExpenseAmount(0); setCurrentExpenseAmountDisplay('');
      setCurrentSalesPaymentInvoiceNo(''); setCurrentSalesPaymentAmount(0); setCurrentSalesPaymentAmountDisplay('');
      setCurrentSalesPaymentReturnPotongan(0); setCurrentSalesPaymentReturnPotonganDisplay('');
      setActiveTab('daily');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };


  // --- Logika Manajemen Hutang ---
  const handleHutangInputChange = useCallback((e) => {
    const { name, value } = e.target;
    if (name === 'jumlahBarangMasuk') {
        setNewHutangEntry(prev => ({ ...prev, [name]: parseCurrency(value) }));
        setJumlahBarangMasukInputDisplay(formatNumberWithThousandsSeparator(value));
    } else {
        setNewHutangEntry(prev => ({ ...prev, [name]: value }));
    }
  }, [parseCurrency, formatNumberWithThousandsSeparator]);

  const handleJumlahBarangMasukBlur = useCallback((e) => {
    handleFormattedInputBlur(e, newHutangEntry.jumlahBarangMasuk, setJumlahBarangMasukInputDisplay);
  }, [handleFormattedInputBlur, newHutangEntry.jumlahBarangMasuk]);

  const handleJumlahBarangMasukFocus = useCallback((e) => {
    handleFormattedInputFocus(e, newHutangEntry.jumlahBarangMasuk, setJumlahBarangMasukInputDisplay);
  }, [handleFormattedInputFocus, newHutangEntry.jumlahBarangMasuk]);

  const addOrUpdateIncomingGoodsDebt = async () => {
    if (!userId) { showModal("Autentikasi belum siap. Mohon tunggu."); return; }

    if (!newHutangEntry.tanggalHutang || !newHutangEntry.noInvoice || !newHutangEntry.namaSales || newHutangEntry.jumlahBarangMasuk <= 0) {
      showModal('Tanggal, No. Invoice, Nama Sales, dan Jumlah Hutang harus diisi dengan benar dan jumlah harus lebih dari 0.');
      return;
    }

    const dataToSave = {
      tanggalHutang: newHutangEntry.tanggalHutang,
      tempo: newHutangEntry.tempo,
      noInvoice: newHutangEntry.noInvoice,
      namaSales: newHutangEntry.namaSales,
      jumlahBarangMasuk: newHutangEntry.jumlahBarangMasuk,
      note: newHutangEntry.note,
    };

    try {
      if (editingHutangEntryId) {
        const docRef = doc(db, `artifacts/${appId}/users/${userId}/incomingGoodsDebtRecords`, editingHutangEntryId);
        const existingRecord = incomingGoodsDebtRecords.find(r => r.id === editingHutangEntryId);
        if (existingRecord) {
             dataToSave.sisaHutang = existingRecord.sisaHutang + (dataToSave.jumlahBarangMasuk - existingRecord.jumlahBarangMasuk);
             dataToSave.payments = existingRecord.payments;
             dataToSave.statusPembayaran = dataToSave.sisaHutang <= 0 ? 'Lunas' : (dataToSave.sisaHutang < dataToSave.jumlahBarangMasuk ? 'Lunas Sebagian' : 'Belum Lunas');
        } else {
            dataToSave.sisaHutang = dataToSave.jumlahBarangMasuk;
            dataToSave.payments = [];
            dataToSave.statusPembayaran = 'Belum Lunas';
        }
        await updateDoc(docRef, dataToSave);
        showModal("Catatan hutang berhasil diperbarui!");
      } else {
        const q = query(collection(db, `artifacts/${appId}/users/${userId}/incomingGoodsDebtRecords`), where("noInvoice", "==", newHutangEntry.noInvoice));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
            showModal(`Nomor Invoice "${newHutangEntry.noInvoice}" sudah ada. Harap gunakan nomor invoice yang unik.`);
            return;
        }
        dataToSave.sisaHutang = newHutangEntry.jumlahBarangMasuk;
        dataToSave.payments = [];
        dataToSave.statusPembayaran = 'Belum Lunas';

        await addDoc(collection(db, `artifacts/${appId}/users/${userId}/incomingGoodsDebtRecords`), dataToSave);
        showModal("Catatan hutang berhasil disimpan!");
      }
    } catch (error) {
      console.error("Error saving/updating debt record:", error);
      showModal("Gagal menyimpan atau memperbarui catatan hutang. Silakan coba lagi.");
    }

    resetHutangForm();
  };

  const resetHutangForm = () => {
    setNewHutangEntry({
      tanggalHutang: '', tempo: '', noInvoice: '', namaSales: '', jumlahBarangMasuk: 0, note: '',
    });
    setJumlahBarangMasukInputDisplay('');
    setEditingHutangEntryId(null);
  };

  const handleEditHutangEntry = (recordId) => {
    const recordToEdit = incomingGoodsDebtRecords.find(record => record.id === recordId);
    if (recordToEdit) {
      setEditingHutangEntryId(recordId);
      setNewHutangEntry({
        tanggalHutang: recordToEdit.tanggalHutang,
        tempo: recordToEdit.tempo,
        noInvoice: recordToEdit.noInvoice,
        namaSales: recordToEdit.namaSales,
        jumlahBarangMasuk: recordToEdit.jumlahBarangMasuk,
        note: recordToEdit.note,
      });
      setJumlahBarangMasukInputDisplay(formatNumberWithThousandsSeparator(recordToEdit.jumlahBarangMasuk));
      setActiveTab('hutang');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedYear, setSelectedYear] = useState(currentYear);

  const filteredDailyRecords = useMemo(() => {
    return dailyRecords.filter(record => {
      const recordDate = new Date(record.tanggal);
      return recordDate.getMonth() + 1 === parseInt(selectedMonth) && recordDate.getFullYear() === parseInt(selectedYear);
    });
  }, [dailyRecords, selectedMonth, selectedYear]);

  const monthlyTotals = useMemo(() => {
    const totals = {
      totalPenjualanTunai: 0,
      totalPengeluaranHarian: 0,
      totalUangSimpan: 0,
      totalHutangBaruDibuat: 0,
      totalPembayaranHutangSalesDetail: 0,
    };

    filteredDailyRecords.forEach(record => {
      totals.totalPenjualanTunai += record.penjualanTunaiCalculated;
      totals.totalUangSimpan += record.uangSimpan;
      totals.totalPengeluaranHarian += record.totalPengeluaranHarian;
      record.salesPayments.forEach(payment => {
        totals.totalPembayaranHutangSalesDetail += payment.amount + (payment.returnPotongan || 0);
      });
    });

    incomingGoodsDebtRecords.filter(debt => {
      const debtDate = new Date(debt.tanggalHutang);
      return debtDate.getMonth() + 1 === parseInt(selectedMonth) && debtDate.getFullYear() === parseInt(selectedYear);
    }).forEach(debt => {
      totals.totalHutangBaruDibuat += debt.jumlahBarangMasuk;
    });

    return totals;
  }, [filteredDailyRecords, incomingGoodsDebtRecords, selectedMonth, selectedYear]);

  const totalOutstandingHutang = useMemo(() => {
    return incomingGoodsDebtRecords.reduce((sum, hutang) => sum + hutang.sisaHutang, 0);
  }, [incomingGoodsDebtRecords]);

  const outstandingInvoices = useMemo(() => {
    return incomingGoodsDebtRecords.filter(debt => debt.sisaHutang > 0);
  }, [incomingGoodsDebtRecords]);

  // Fitur baru: Ringkasan Hutang per Sales
  const debtSummaryBySales = useMemo(() => {
    const summary = {};
    incomingGoodsDebtRecords.forEach(debt => {
      if (!summary[debt.namaSales]) {
        summary[debt.namaSales] = {
          totalDebt: 0,
          outstandingDebt: 0,
          lastVisitDate: null,
          invoices: [],
        };
      }
      summary[debt.namaSales].totalDebt += debt.jumlahBarangMasuk;
      summary[debt.namaSales].outstandingDebt += debt.sisaHutang;
      
      // Update lastVisitDate based on the latest payment or debt entry date
      const latestDate = debt.payments && debt.payments.length > 0
        ? new Date(Math.max(...debt.payments.map(p => new Date(p.tanggalPembayaran))))
        : new Date(debt.tanggalHutang);
      
      if (!summary[debt.namaSales].lastVisitDate || latestDate > new Date(summary[debt.namaSales].lastVisitDate)) {
        summary[debt.namaSales].lastVisitDate = latestDate.toISOString().split('T')[0]; // Simpan sebagai YYYY-MM-DD
      }

      summary[debt.namaSales].invoices.push({
        noInvoice: debt.noInvoice,
        tanggalHutang: debt.tanggalHutang,
        tempo: debt.tempo,
        jumlahBarangMasuk: debt.jumlahBarangMasuk,
        sisaHutang: debt.sisaHutang,
        statusPembayaran: debt.statusPembayaran,
        payments: debt.payments,
        id: debt.id,
      });
    });

    // Sort invoices within each sales summary by due date
    Object.values(summary).forEach(sales => {
        sales.invoices.sort((a, b) => new Date(a.tempo) - new Date(b.tempo));
    });

    return summary;
  }, [incomingGoodsDebtRecords]);


  const years = useMemo(() => Array.from({ length: 5 }, (_, i) => currentYear - 2 + i), [currentYear]);


  // Fungsi ini digunakan di UI (tombol "Unduh Laporan PDF")
  const handleDownloadPdf = useCallback(() => {
    const element = laporanRef.current;
    if (element) {
        if (typeof window.html2pdf !== 'undefined') {
            const opt = {
                margin:       0.5,
                filename:     `Laporan_Bulanan_Minimarket_${selectedMonth}-${selectedYear}.pdf`,
                image:        { type: 'jpeg', quality: 0.98 },
                html2canvas:  { scale: 2, logging: true, dpi: 192, letterRendering: true },
                jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
            };
            window.html2pdf().set(opt).from(element).save();
        } else {
            showModal("html2pdf.js tidak dimuat. Pastikan script tag ada di public/index.html.");
        }
    } else {
        showModal("Tidak ada konten laporan untuk diunduh.");
    }
  }, [selectedMonth, selectedYear, showModal]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      showModal("Anda telah logout.");
    } catch (error) {
      console.error("Error logging out:", error);
      showModal("Gagal logout. Silakan coba lagi.");
    }
  };

  // --- Fungsi Login dan Registrasi Baru ---
  const handleRegister = async () => {
    if (!email || !password) {
      showModal('Email dan kata sandi harus diisi.');
      return;
    }
    if (password.length < 6) {
      showModal('Kata sandi harus minimal 6 karakter.');
      return;
    }
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      showModal('Registrasi berhasil! Anda telah login.');
    } catch (error) {
      console.error("Error during registration:", error);
      // Firebase error codes: https://firebase.google.com/docs/auth/admin/errors
      let errorMessage = 'Gagal mendaftar. Silakan coba lagi.';
      if (error.code === 'auth/email-already-in-use') {
        errorMessage = 'Email ini sudah digunakan. Coba login atau gunakan email lain.';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Format email tidak valid.';
      } else if (error.code === 'auth/weak-password') {
        errorMessage = 'Kata sandi terlalu lemah. Gunakan minimal 6 karakter.';
      }
      showModal(errorMessage);
    }
  };

  const handleLogin = async () => {
    if (!email || !password) {
      showModal('Email dan kata sandi harus diisi.');
      return;
    }
    try {
      await signInWithEmailAndPassword(auth, email, password);
      showModal('Login berhasil!');
    } catch (error) {
      console.error("Error during login:", error);
      let errorMessage = 'Gagal login. Periksa email dan kata sandi Anda.';
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
        errorMessage = 'Email atau kata sandi salah.';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Format email tidak valid.';
      }
      showModal(errorMessage);
    }
  };


  // --- Gemini API Integrations ---

  // Fitur 1: Pembuat Catatan Pengingat Hutang
  const generateDebtReminder = async (invoice) => {
    setIsGeneratingReminder(true);
    setGeminiReminderText('Membuat pengingat...');
    // API KEY DI SINI HARUS KOSONG ("") agar Canvas secara otomatis menyuntikkannya.
    const apiKey = ""; 

    const prompt = `Buatkan catatan pengingat singkat dan sopan untuk hutang ini. 
      Nomor Invoice: ${invoice.noInvoice}, 
      Nama Sales: ${invoice.namaSales}, 
      Sisa Hutang: ${formatCurrency(invoice.sisaHutang)}, 
      Tanggal Jatuh Tempo: ${formatDate(invoice.tempo || 'N/A')}. 
      Jika tanggal jatuh tempo sudah lewat, tambahkan kalimat 'Mohon segera lakukan pembayaran.'. 
      Isi catatan harus dalam bahasa Indonesia yang formal.`;

    let chatHistory = [];
    chatHistory.push({ role: "user", parts: [{ text: prompt }] });

    const payload = { contents: chatHistory };
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await response.json();

      if (result.candidates && result.candidates.length > 0 &&
          result.candidates[0].content && result.candidates[0].content.parts &&
          result.candidates[0].content.parts.length > 0) {
        setGeminiReminderText(result.candidates[0].content.parts[0].text);
      } else {
        setGeminiReminderText('Gagal membuat pengingat. Struktur respons tidak terduga.');
        console.error('Gemini API response structure unexpected:', result);
      }
    } catch (error) {
      console.error("Error calling Gemini API for reminder:", error);
      setGeminiReminderText('Terjadi kesalahan saat menghubungi layanan AI.');
    } finally {
      setIsGeneratingReminder(false);
    }
  };

  // Fitur 2: Analisis Keuangan Bulanan (Digunakan di UI)
  const generateMonthlyAnalysis = useCallback(async () => {
    setIsGeneratingAnalysis(true);
    setGeminiAnalysisText('Menganalisis data...');
    // API KEY DI SINI HARUS KOSONG ("") agar Canvas secara otomatis menyuntikkannya.
    const apiKey = ""; 

    const prompt = `Saya memiliki data keuangan minimarket untuk bulan ${new Date(selectedYear, selectedMonth - 1).toLocaleString('id-ID', { month: 'long', year: 'numeric' })}:
      - Total Penjualan Tunai: ${formatCurrency(monthlyTotals.totalPenjualanTunai)}
      - Total Pengeluaran Harian: ${formatCurrency(monthlyTotals.totalPengeluaranHarian)}
      - Total Uang Simpan: ${formatCurrency(monthlyTotals.totalUangSimpan)}
      - Total Hutang Baru Dibuat: ${formatCurrency(monthlyTotals.totalHutangNewMade)}
      - Total Pembayaran Hutang Sales: ${formatCurrency(monthlyTotals.totalSalesPaymentsDetail)}
      - Perkiraan Saldo Akhir Bulan: ${formatCurrency(dailyRecords.length > 0 ? dailyRecords[dailyRecords.length - 1].saldoHariIni : 0)}.

      Berikan analisis singkat dan satu saran keuangan yang actionable berdasarkan data ini. Fokus pada kesehatan arus kas atau pengelolaan hutang. Gunakan bahasa Indonesia.`;

    let chatHistory = [];
    chatHistory.push({ role: "user", parts: [{ text: prompt }] });

    const payload = { contents: chatHistory };
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await response.json();

      if (result.candidates && result.candidates.length > 0 &&
          result.candidates[0].content && result.candidates[0].content.parts &&
          result.candidates[0].content.parts.length > 0) {
        setGeminiAnalysisText(result.candidates[0].content.parts[0].text);
      } else {
        setGeminiAnalysisText('Gagal membuat analisis. Struktur respons tidak terduga.');
        console.error('Gemini API response structure unexpected:', result);
      }
    } catch (error) {
      console.error("Error calling Gemini API for analysis:", error);
      setGeminiAnalysisText('Terjadi kesalahan saat menghubungi layanan AI.');
    } finally {
      setIsGeneratingAnalysis(false);
    }
  }, [formatCurrency, monthlyTotals, dailyRecords, selectedMonth, selectedYear]);


  // --- UI Utama Aplikasi ---
  if (!isAuthReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <div className="bg-white p-8 rounded-xl shadow-xl text-center">
          <p className="text-xl font-semibold text-gray-700">Memuat autentikasi...</p>
          <div className="mt-4 animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
        </div>
      </div>
    );
  }

  // Tampilkan layar login/register jika tidak ada user yang terautentikasi
  if (!user) { 
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <div className="bg-white p-8 rounded-xl shadow-xl max-w-md w-full text-center">
          <h2 className="text-2xl font-bold text-blue-700 mb-6">Selamat Datang di Aplikasi Pembukuan Minimarket</h2>
          <p className="text-gray-700 mb-6">Silakan {isRegistering ? 'daftar' : 'login'} untuk mengakses data Anda.</p>

          <div className="mb-4">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base"
            />
          </div>
          <div className="mb-6">
            <input
              type="password"
              placeholder="Kata Sandi"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base"
            />
          </div>

          {!isRegistering ? (
            <>
              <button
                onClick={handleLogin}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg shadow-md transition duration-200 ease-in-out transform hover:scale-105"
              >
                Login
              </button>
              <p className="mt-4 text-gray-600">
                Belum punya akun?{' '}
                <button
                  onClick={() => setIsRegistering(true)}
                  className="text-blue-600 hover:underline font-semibold"
                >
                  Daftar di sini
                </button>
              </p>
            </>
          ) : (
            <>
              <button
                onClick={handleRegister}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-4 rounded-lg shadow-md transition duration-200 ease-in-out transform hover:scale-105"
              >
                Daftar
              </button>
              <p className="mt-4 text-gray-600">
                Sudah punya akun?{' '}
                <button
                  onClick={() => setIsRegistering(false)}
                  className="text-blue-600 hover:underline font-semibold"
                >
                  Login
                </button>
              </p>
            </>
          )}
          
          <p className="text-xs text-gray-500 mt-4">ID Pengguna Anda: {user ? user.uid : 'Belum Login'}</p>
        </div>
        {isModalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl p-6 shadow-2xl max-w-sm w-full transform transition-all duration-300 scale-105">
              <h3 className="text-xl font-bold text-gray-900 mb-4 text-center">Peringatan</h3>
              <p className="text-gray-700 mb-6 text-center">{modalMessage}</p>
              <button onClick={closeModal} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg shadow-md">OK</button>
            </div>
          </div>
        )}
      </div>
    );
  }


  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 font-inter text-gray-800 antialiased">
      {/* Modal untuk menampilkan peringatan */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 shadow-2xl max-w-sm w-full transform transition-all duration-300 scale-105">
            <h3 className="text-xl font-bold text-gray-900 mb-4 text-center">Peringatan</h3>
            <p className="text-gray-700 mb-6 text-center">{modalMessage}</p>
            <button
              onClick={closeModal}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-75 transition duration-200 ease-in-out"
            >
              OK
            </button>
          </div>
        </div>
      )}

      {/* Modal untuk Riwayat Pembayaran Invoice */}
      {isHistoryModalOpen && selectedInvoiceForHistory && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 shadow-2xl max-w-lg w-full transform transition-all duration-300 scale-105">
            <h3 className="text-xl font-bold text-gray-900 mb-4 text-center">Riwayat Pembayaran Invoice: {selectedInvoiceForHistory.noInvoice}</h3>
            <p className="text-gray-700 mb-2">**Sales:** {selectedInvoiceForHistory.namaSales}</p>
            <p className="text-gray-700 mb-2">**Jumlah Hutang Awal:** {formatCurrency(selectedInvoiceForHistory.jumlahBarangMasuk)}</p>
            {selectedInvoiceForHistory.note && (
              <p className="text-gray-700 mb-4">**Catatan:** {selectedInvoiceForHistory.note}</p>
            )}
            <p className="text-gray-700 mb-4">**Sisa Hutang:** <span className="font-bold text-red-600">{formatCurrency(selectedInvoiceForHistory.sisaHutang)}</span></p>

            {selectedInvoiceForHistory.payments && selectedInvoiceForHistory.payments.length > 0 ? (
              <div className="max-h-60 overflow-y-auto mb-4 border border-gray-200 rounded-lg">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tanggal Bayar</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Jumlah Bayar</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Potongan</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {selectedInvoiceForHistory.payments.map((payment, index) => (
                      <tr key={index}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{formatDate(payment.tanggalPembayaran)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 font-semibold">{formatCurrency(payment.jumlahBayar)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-yellow-600 font-semibold">{formatCurrency(payment.potongan || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-gray-500 italic text-center mb-4">Belum ada pembayaran untuk invoice ini.</p>
            )}

            <button
              onClick={closeHistoryModal}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-75 transition duration-200 ease-in-out"
            >
              Tutup
            </button>
          </div>
        </div>
      )}

      {/* Modal untuk Detail Transaksi Harian */}
      {isDailyDetailModalOpen && selectedDailyRecordForDetails && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 shadow-2xl max-w-lg w-full transform transition-all duration-300 scale-105">
            <h3 className="text-xl font-bold text-gray-900 mb-4 text-center">Rincian Transaksi Harian: {formatDate(selectedDailyRecordForDetails.tanggal)}</h3>

            <h4 className="text-md font-bold text-gray-800 mb-2">Rincian Pengeluaran:</h4>
            {selectedDailyRecordForDetails.detailedExpenses && selectedDailyRecordForDetails.detailedExpenses.length > 0 ? (
              <ul className="list-disc list-inside mb-4 max-h-40 overflow-y-auto border border-gray-200 rounded-lg p-3">
                {selectedDailyRecordForDetails.detailedExpenses.map((exp, i) => (
                  <li key={i}>{exp.description}: {formatCurrency(exp.amount)}</li>
                ))}
                <li className="font-bold border-t pt-2 mt-2">Total: {formatCurrency(selectedDailyRecordForDetails.detailedExpenses.reduce((sum, exp) => sum + exp.amount, 0))}</li>
              </ul>
            ) : (
              <p className="text-gray-500 italic mb-4">Tidak ada rincian pengeluaran.</p>
            )}

            <h4 className="text-md font-bold text-gray-800 mb-2">Pembayaran Hutang Sales:</h4>
            {selectedDailyRecordForDetails.salesPayments && selectedDailyRecordForDetails.salesPayments.length > 0 ? (
              <ul className="list-disc list-inside mb-4 max-h-40 overflow-y-auto border border-gray-200 rounded-lg p-3">
                {selectedDailyRecordForDetails.salesPayments.map((payment, i) => (
                  <li key={i}>Invoice {payment.invoiceNo}: {formatCurrency(payment.amount)} (Potongan: {formatCurrency(payment.returnPotongan || 0)})</li>
                ))}
                <li className="font-bold border-t pt-2 mt-2">Total: {formatCurrency(selectedDailyRecordForDetails.salesPayments.reduce((sum, payment) => sum + payment.amount + (payment.returnPotongan || 0), 0))}</li>
              </ul>
            ) : (
              <p className="text-gray-500 italic mb-4">Tidak ada pembayaran hutang sales.</p>
            )}

            <button
              onClick={closeDailyDetailModal}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-75 transition duration-200 ease-in-out"
            >
              Tutup
            </button>
          </div>
        </div>
      )}


      <div className="max-w-6xl mx-auto bg-white p-4 sm:p-8 rounded-2xl shadow-xl border border-gray-200">
        <div className="flex flex-col sm:flex-row justify-between items-center mb-6">
          <h1 className="text-2xl sm:text-4xl font-extrabold text-center sm:text-left text-blue-800 mb-4 sm:mb-0 tracking-tight">
            Aplikasi Pembukuan Minimarket
          </h1>
          <div className="flex flex-col items-center sm:items-end">
            <p className="text-sm text-gray-600">ID Pengguna Anda: <span className="font-semibold text-blue-800 break-all">{user ? user.email : 'Belum Login'}</span></p>
            <button
              onClick={handleLogout}
              className="mt-2 bg-red-500 hover:bg-red-600 text-white text-sm font-semibold py-1 px-3 rounded-lg shadow-sm transition duration-200 ease-in-out"
            >
              Logout
            </button>
          </div>
        </div>


        {/* Navigasi Tab */}
        <div className="flex flex-wrap justify-center sm:justify-start gap-2 sm:gap-4 mb-8 bg-gray-100 rounded-lg p-2 shadow-inner">
          <button
            onClick={() => setActiveTab('daily')}
            className={`flex-1 sm:flex-none px-4 py-2 sm:px-6 sm:py-3 text-sm sm:text-lg font-semibold rounded-lg transition duration-300 ease-in-out ${
              activeTab === 'daily' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-700 hover:bg-gray-200'
            }`}
          >
            Pencatatan Harian
          </button>
          <button
            onClick={() => setActiveTab('hutang')}
            className={`flex-1 sm:flex-none px-4 py-2 sm:px-6 sm:py-3 text-sm sm:text-lg font-semibold rounded-lg transition duration-300 ease-in-out ${
              activeTab === 'hutang' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-700 hover:bg-gray-200'
            }`}
          >
            Manajemen Hutang
          </button>
          <button
            onClick={() => setActiveTab('report')}
            className={`flex-1 sm:flex-none px-4 py-2 sm:px-6 sm:py-3 text-sm sm:text-lg font-semibold rounded-lg transition duration-300 ease-in-out ${
              activeTab === 'report' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-700 hover:bg-gray-200'
            }`}
          >
            Laporan Bulanan
          </button>
        </div>

        {/* --- Konten Tab Pencatatan Harian --- */}
        {activeTab === 'daily' && (
          <div id="daily-entry-section">
            <h2 className="text-2xl sm:text-3xl font-bold text-blue-700 mb-6 text-center">Pencatatan Arus Kas Harian</h2>
            {/* Form Input Data Utama Harian */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-8 p-4 sm:p-6 bg-blue-50 rounded-lg shadow-inner border border-blue-200">
              {/* Tanggal */}
              <div>
                <label htmlFor="tanggal" className="block text-sm font-semibold text-gray-700 mb-1">Tanggal:</label>
                <input
                  type="date"
                  id="tanggal"
                  name="tanggal"
                  value={newDailyEntry.tanggal}
                  onChange={(e) => setNewDailyEntry(prev => ({ ...prev, tanggal: e.target.value }))}
                  className="mt-1 block w-full px-3 py-2 sm:px-4 sm:py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base transition duration-150 ease-in-out"
                />
              </div>
              {/* Baki Semalam (Otomatis) */}
              <div>
                <label htmlFor="bakiSemalam" className="block text-sm font-semibold text-gray-700 mb-1">Baki Semalam (Rp):</label>
                <input
                  type="text"
                  id="bakiSemalam"
                  name="bakiSemalam"
                  value={formatCurrency(newDailyEntry.bakiSemalam)}
                  readOnly
                  className="mt-1 block w-full px-3 py-2 sm:px-4 sm:py-2 border border-gray-300 bg-gray-100 rounded-lg shadow-sm text-base cursor-not-allowed font-medium"
                />
                <p className="text-xs text-gray-500 mt-1">
                  *Otomatis: Saldo Hari Ini terakhir - Uang Simpan terakhir (akan mencari tanggal sebelumnya jika ada hari libur).
                </p>
              </div>
              {/* Saldo Hari Ini (Manual) */}
              <div>
                <label htmlFor="saldoHariIni" className="block text-sm font-semibold text-gray-700 mb-1">Saldo Hari Ini (Rp):</label>
                <input
                  type="text"
                  id="saldoHariIni"
                  name="saldoHariIni"
                  value={saldoHariIniInputDisplay}
                  onChange={(e) => handleObjectNumericInputChange(e, setSaldoHariIniInputDisplay, setNewDailyEntry, 'saldoHariIni')}
                  onBlur={(e) => handleFormattedInputBlur(e, newDailyEntry.saldoHariIni, setSaldoHariIniInputDisplay)}
                  onFocus={(e) => handleFormattedInputFocus(e, newDailyEntry.saldoHariIni, setSaldoHariIniInputDisplay)}
                  className="mt-1 block w-full px-3 py-2 sm:px-4 sm:py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base transition duration-150 ease-in-out"
                />
              </div>
              {/* Uang Simpan (Manual) */}
              <div>
                <label htmlFor="uangSimpan" className="block text-sm font-semibold text-gray-700 mb-1">Uang Simpan (Rp):</label>
                <input
                  type="text"
                  id="uangSimpan"
                  name="uangSimpan"
                  value={uangSimpanInputDisplay}
                  onChange={(e) => handleObjectNumericInputChange(e, setUangSimpanInputDisplay, setNewDailyEntry, 'uangSimpan')}
                  onBlur={(e) => handleFormattedInputBlur(e, newDailyEntry.uangSimpan, setUangSimpanInputDisplay)}
                  onFocus={(e) => handleFormattedInputFocus(e, newDailyEntry.uangSimpan, setUangSimpanInputDisplay)}
                  className="mt-1 block w-full px-3 py-2 sm:px-4 sm:py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base transition duration-150 ease-in-out"
                />
              </div>
              {/* Total Pengeluaran Harian (Otomatis) */}
              <div>
                <label htmlFor="totalPengeluaranHarian" className="block text-sm font-semibold text-gray-700 mb-1">Total Pengeluaran Harian (Rp):</label>
                <input
                  type="text"
                  id="totalPengeluaranHarian"
                  value={formatCurrency(calculatedDailyData.totalPengeluaranHarian)}
                  readOnly
                  className="mt-1 block w-full px-3 py-2 sm:px-4 sm:py-2 border border-gray-300 bg-gray-100 rounded-lg shadow-sm text-base cursor-not-allowed font-medium"
                />
                <p className="text-xs text-gray-500 mt-1">*Otomatis: Rincian Pengeluaran + Pembayaran Hutang Sales</p>
              </div>
              {/* Penjualan Tunai (Otomatis) */}
              <div>
                <label htmlFor="penjualanTunaiCalculated" className="block text-sm font-semibold text-gray-700 mb-1">Penjualan Tunai (Otomatis) (Rp):</label>
                <input
                  type="text"
                  id="penjualanTunaiCalculated"
                  value={formatCurrency(calculatedDailyData.penjualanTunaiCalculated)}
                  readOnly
                  className="mt-1 block w-full px-3 py-2 sm:px-4 sm:py-2 border border-gray-300 bg-gray-100 rounded-lg shadow-sm text-base cursor-not-allowed font-medium"
                />
                <p className="text-xs text-gray-500 mt-1">*Otomatis: Saldo Hari Ini + Uang Simpan + Total Pengeluaran - Baki Semalam</p>
              </div>
            </div>

            {/* Rincian Pengeluaran */}
            <div className="mb-8 p-4 sm:p-6 bg-red-50 rounded-lg shadow-inner border border-red-200">
              <h3 className="text-lg sm:text-xl font-bold text-red-700 mb-4">Rincian Pengeluaran</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label htmlFor="expenseDescription" className="block text-sm font-semibold text-gray-700 mb-1">Deskripsi:</label>
                  <input
                    type="text"
                    id="expenseDescription"
                    value={currentExpenseDescription}
                    onChange={(e) => setCurrentExpenseDescription(e.target.value)}
                    placeholder="Contoh: Makan Karyawan, Listrik"
                    className="mt-1 block w-full px-3 py-2 sm:px-4 sm:py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 text-base"
                  />
                </div>
                <div>
                  <label htmlFor="expenseAmount" className="block text-sm font-semibold text-gray-700 mb-1">Jumlah (Rp):</label>
                  <input
                    type="text"
                    id="expenseAmount"
                    value={currentExpenseAmountDisplay}
                    onChange={(e) => handleDirectNumericInputChange(e, setCurrentExpenseAmountDisplay, setCurrentExpenseAmount)}
                    onBlur={(e) => handleFormattedInputBlur(e, currentExpenseAmount, setCurrentExpenseAmountDisplay)}
                    onFocus={(e) => handleFormattedInputFocus(e, currentExpenseAmount, setCurrentExpenseAmountDisplay)}
                    className="mt-1 block w-full px-3 py-2 sm:px-4 sm:py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 text-base"
                  />
                </div>
              </div>
              <button
                onClick={addDetailedExpense}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg shadow-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-75 transition duration-200 ease-in-out"
              >
                Tambah Pengeluaran
              </button>

              {newDailyEntry.detailedExpenses.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-md font-semibold text-gray-700 mb-2">Daftar Pengeluaran Hari Ini:</h4>
                  <ul className="list-disc list-inside bg-white p-4 rounded-lg border border-gray-200">
                    {newDailyEntry.detailedExpenses.map((exp, index) => (
                      <li key={index} className="flex justify-between items-center py-1 text-sm sm:text-base">
                        <span>{exp.description}: <span className="font-semibold">{formatCurrency(exp.amount)}</span></span>
                        <button
                          onClick={() => removeDetailedExpense(index)}
                          className="ml-2 text-red-500 hover:text-red-700 text-sm"
                        >
                          Hapus
                        </button>
                      </li>
                    ))}
                    <li className="flex justify-between items-center py-2 font-bold border-t border-gray-300 mt-2 pt-2 text-sm sm:text-base">
                      <span>Total Rincian Pengeluaran:</span>
                      <span>{formatCurrency(totalDetailedExpenses)}</span>
                    </li>
                  </ul>
                </div>
              )}
            </div>

            {/* Pembayaran Hutang Sales */}
            <div className="mb-8 p-4 sm:p-6 bg-purple-50 rounded-lg shadow-inner border border-purple-200">
              <h3 className="text-lg sm:text-xl font-bold text-purple-700 mb-4">Pembayaran Hutang Sales</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label htmlFor="invoiceNoPayment" className="block text-sm font-semibold text-gray-700 mb-1">Cari No. Invoice:</label>
                  <select
                    id="invoiceNoPayment"
                    value={currentSalesPaymentInvoiceNo}
                    onChange={(e) => setCurrentSalesPaymentInvoiceNo(e.target.value)}
                    className="mt-1 block w-full px-3 py-2 sm:px-4 sm:py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-base"
                  >
                    <option value="">-- Pilih Invoice --</option>
                    {outstandingInvoices.map(invoice => (
                      <option key={invoice.id} value={invoice.noInvoice}>
                        {invoice.noInvoice} - {invoice.namaSales} (Sisa: {formatCurrency(invoice.sisaHutang)})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="salesPaymentReturnPotongan" className="block text-sm font-semibold text-gray-700 mb-1">Return/Potongan (Rp):</label>
                  <input
                    type="text"
                    id="salesPaymentReturnPotongan"
                    value={currentSalesPaymentReturnPotonganDisplay}
                    onChange={(e) => handleDirectNumericInputChange(e, setCurrentSalesPaymentReturnPotonganDisplay, setCurrentSalesPaymentReturnPotongan)}
                    onBlur={(e) => handleFormattedInputBlur(e, currentSalesPaymentReturnPotongan, setCurrentSalesPaymentReturnPotonganDisplay)}
                    onFocus={(e) => handleFormattedInputFocus(e, currentSalesPaymentReturnPotongan, setCurrentSalesPaymentReturnPotonganDisplay)}
                    className="mt-1 block w-full px-3 py-2 sm:px-4 sm:py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-base"
                  />
                </div>
                <div className="md:col-span-2">
                  <label htmlFor="salesPaymentAmount" className="block text-sm font-semibold text-gray-700 mb-1">Jumlah Pembayaran (Rp):</label>
                  <input
                    type="text"
                    id="salesPaymentAmount"
                    value={currentSalesPaymentAmountDisplay}
                    onChange={(e) => handleDirectNumericInputChange(e, setCurrentSalesPaymentAmountDisplay, setCurrentSalesPaymentAmount)}
                    onBlur={(e) => handleFormattedInputBlur(e, currentSalesPaymentAmount, setCurrentSalesPaymentAmountDisplay)}
                    onFocus={(e) => handleFormattedInputFocus(e, currentSalesPaymentAmount, setCurrentSalesPaymentAmountDisplay)}
                    className="mt-1 block w-full px-3 py-2 sm:px-4 sm:py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-base"
                  />
                </div>
              </div>
              <button
                onClick={addSalesPaymentToDaily}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-lg shadow-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-opacity-75 transition duration-200 ease-in-out"
              >
                Tambah Pembayaran Hutang
              </button>

              {newDailyEntry.salesPayments.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-md font-semibold text-gray-700 mb-2">Daftar Pembayaran Hutang Hari Ini:</h4>
                  <ul className="list-disc list-inside bg-white p-4 rounded-lg border border-gray-200">
                    {newDailyEntry.salesPayments.map((payment, index) => (
                      <li key={index} className="flex justify-between items-center py-1 text-sm sm:text-base">
                        <span>Invoice **{payment.invoiceNo}**: {formatCurrency(payment.amount)} (Potongan: {formatCurrency(payment.returnPotongan || 0)})</span>
                        <button
                          onClick={() => removeSalesPaymentFromDaily(index)}
                          className="ml-2 text-red-500 hover:text-red-700 text-sm"
                        >
                          Hapus
                        </button>
                      </li>
                    ))}
                    <li className="flex justify-between items-center py-2 font-bold border-t border-gray-300 mt-2 pt-2 text-sm sm:text-base">
                      <span>Total Pembayaran Hutang Sales:</span>
                      <span>{formatCurrency(totalSalesPaymentsForDaily)}</span>
                    </li>
                  </ul>
                </div>
              )}
            </div>

            {/* Tombol Simpan Pencatatan Harian */}
            <button
              onClick={addOrUpdateDailyEntry}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg shadow-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-75 transition duration-200 ease-in-out transform hover:scale-105"
            >
              {editingDailyRecordId ? 'Update Pencatatan Harian' : 'Simpan Pencatatan Harian'}
            </button>
            {editingDailyRecordId && (
              <button
                onClick={resetDailyForm}
                className="w-full mt-4 bg-gray-500 hover:bg-gray-600 text-white font-bold py-3 px-6 rounded-lg shadow-lg focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-opacity-75 transition duration-200 ease-in-out transform hover:scale-105"
              >
                Batal Edit
              </button>
            )}

            {/* Tabel Riwayat Pencatatan Harian */}
            <h3 className="text-xl sm:text-2xl font-bold text-gray-800 mt-12 mb-4 text-center">Riwayat Pencatatan Harian</h3>
            <div className="mt-6 overflow-x-auto rounded-xl shadow-xl border border-gray-200">
              <table className="min-w-full divide-y divide-blue-200">
                <thead className="bg-blue-600 text-white">
                  <tr>
                    <th scope="col" className="px-3 py-3 sm:px-6 sm:py-4 text-left text-xs sm:text-sm font-bold uppercase tracking-wider rounded-tl-xl">Tanggal</th>
                    <th scope="col" className="px-3 py-3 sm:px-6 sm:py-4 text-left text-xs sm:text-sm font-bold uppercase tracking-wider">Rincian Pengeluaran</th>
                    <th scope="col" className="px-3 py-3 sm:px-6 sm:py-4 text-left text-xs sm:text-sm font-bold uppercase tracking-wider">Pembayaran Hutang Sales</th>
                    <th scope="col" className="px-3 py-3 sm:px-6 sm:py-4 text-left text-xs sm:text-sm font-bold uppercase tracking-wider">Total Pengeluaran</th>
                    <th scope="col" className="px-3 py-3 sm:px-6 sm:py-4 text-left text-xs sm:text-sm font-bold uppercase tracking-wider rounded-tr-xl">Aksi</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {dailyRecords.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="px-3 py-4 sm:px-6 sm:py-6 whitespace-nowrap text-sm sm:text-base text-gray-500 text-center italic">
                        Belum ada pencatatan harian.
                      </td>
                    </tr>
                  ) : (
                    dailyRecords.map((entry) => (
                      <tr key={entry.id} className="hover:bg-blue-50 transition duration-100 ease-in-out">
                        <td className="px-3 py-4 sm:px-6 sm:py-4 whitespace-nowrap text-xs sm:text-sm font-medium text-gray-900">{formatDate(entry.tanggal)}</td>
                        <td className="px-3 py-4 sm:px-6 sm:py-4 text-xs sm:text-sm text-gray-700">
                          {entry.detailedExpenses && entry.detailedExpenses.length > 0 ? (
                            <ul className="list-disc list-inside">
                              {entry.detailedExpenses.map((exp, i) => (
                                <li key={i}>{exp.description}: {formatCurrency(exp.amount)}</li>
                              ))}
                            </ul>
                          ) : 'N/A'}
                        </td>
                        <td className="px-3 py-4 sm:px-6 sm:py-4 text-xs sm:text-sm text-gray-700">
                          {entry.salesPayments && entry.salesPayments.length > 0 ? (
                            <ul className="list-disc list-inside">
                              {entry.salesPayments.map((payment, i) => (
                                <li key={i}>Inv. {payment.invoiceNo}: {formatCurrency(payment.amount)} (Potongan: {formatCurrency(payment.returnPotongan || 0)})</li>
                              ))}
                            </ul>
                          ) : 'N/A'}
                        </td>
                        {/* Perbaikan di sini: Menggunakan entry.totalPengeluaranHarian */}
                        <td className="px-3 py-4 sm:px-6 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-red-700 font-semibold">{formatCurrency(entry.totalPengeluaranHarian)}</td>
                        <td className="px-3 py-4 sm:px-6 sm:py-4 whitespace-nowrap text-xs sm:text-sm font-medium">
                          <button
                            onClick={() => handleEditDailyEntry(entry.id)}
                            className="text-blue-600 hover:text-blue-900 transition duration-150 ease-in-out"
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* --- Konten Tab Manajemen Hutang --- */}
        {activeTab === 'hutang' && (
          <div id="debt-management-section">
            <h2 className="text-2xl sm:text-3xl font-bold text-blue-700 mb-6 text-center">Manajemen Hutang Sales</h2>
            {/* Form Catat Barang Masuk (Hutang Baru) */}
            <div className="mb-8 p-4 sm:p-6 bg-yellow-50 rounded-lg shadow-inner border border-yellow-200">
              <h3 className="text-lg sm:text-xl font-bold text-yellow-700 mb-4">Catat Barang Masuk (Hutang Baru)</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-4">
                <div>
                  <label htmlFor="tanggalHutang" className="block text-sm font-semibold text-gray-700 mb-1">Tanggal Masuk Barang:</label>
                  <input
                    type="date"
                    id="tanggalHutang"
                    name="tanggalHutang"
                    value={newHutangEntry.tanggalHutang}
                    onChange={handleHutangInputChange}
                    className="mt-1 block w-full px-3 py-2 sm:px-4 sm:py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 text-base transition duration-150 ease-in-out"
                  />
                </div>
                <div>
                  <label htmlFor="tempo" className="block text-sm font-semibold text-gray-700 mb-1">Tanggal Jatuh Tempo:</label>
                  <input
                    type="date"
                    id="tempo"
                    name="tempo"
                    value={newHutangEntry.tempo}
                    onChange={handleHutangInputChange}
                    className="mt-1 block w-full px-3 py-2 sm:px-4 sm:py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 text-base transition duration-150 ease-in-out"
                  />
                </div>
                <div>
                  <label htmlFor="noInvoice" className="block text-sm font-semibold text-gray-700 mb-1">No. Invoice:</label>
                  <input
                    type="text"
                    id="noInvoice"
                    name="noInvoice"
                    value={newHutangEntry.noInvoice}
                    onChange={handleHutangInputChange}
                    placeholder="Contoh: INV-001"
                    className="mt-1 block w-full px-3 py-2 sm:px-4 sm:py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 text-base transition duration-150 ease-in-out"
                  />
                </div>
                <div>
                  <label htmlFor="namaSales" className="block text-sm font-semibold text-gray-700 mb-1">Nama Sales/Pemasok:</label>
                  <input
                    type="text"
                    id="namaSales"
                    name="namaSales"
                    value={newHutangEntry.namaSales}
                    onChange={handleHutangInputChange}
                    placeholder="Contoh: PT. ABC Supplier"
                    className="mt-1 block w-full px-3 py-2 sm:px-4 sm:py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 text-base transition duration-150 ease-in-out"
                  />
                </div>
                <div className="md:col-span-1">
                  <label htmlFor="jumlahBarangMasuk" className="block text-sm font-semibold text-gray-700 mb-1">Jumlah Hutang (Nilai Barang Masuk) (Rp):</label>
                  <input
                    type="text"
                    id="jumlahBarangMasuk"
                    name="jumlahBarangMasuk"
                    value={jumlahBarangMasukInputDisplay}
                    onChange={(e) => handleObjectNumericInputChange(e, setJumlahBarangMasukInputDisplay, setNewHutangEntry, 'jumlahBarangMasuk')}
                    onBlur={handleJumlahBarangMasukBlur}
                    onFocus={handleJumlahBarangMasukFocus}
                    className="mt-1 block w-full px-3 py-2 sm:px-4 sm:py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 text-base transition duration-150 ease-in-out"
                  />
                </div>
                <div className="md:col-span-2">
                  <label htmlFor="note" className="block text-sm font-semibold text-gray-700 mb-1">Note (opsional):</label>
                  <textarea
                    id="note"
                    name="note"
                    value={newHutangEntry.note}
                    onChange={handleHutangInputChange}
                    placeholder="Contoh: Ada potongan 10% karena barang rusak."
                    rows="2"
                    className="mt-1 block w-full px-3 py-2 sm:px-4 sm:py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 text-base transition duration-150 ease-in-out"
                  ></textarea>
                </div>
              </div>
              <button
                onClick={addOrUpdateIncomingGoodsDebt}
                className="w-full bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-3 px-6 rounded-lg shadow-lg focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-opacity-75 transition duration-200 ease-in-out transform hover:scale-105"
              >
                {editingHutangEntryId ? 'Update Hutang' : 'Tambah Hutang Baru'}
              </button>
              {editingHutangEntryId && (
              <button
                onClick={resetHutangForm}
                className="w-full mt-4 bg-gray-500 hover:bg-gray-600 text-white font-bold py-3 px-6 rounded-lg shadow-lg focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-opacity-75 transition duration-200 ease-in-out transform hover:scale-105"
              >
                Batal Edit
              </button>
            )}
            </div>

            {/* Tabel Daftar Hutang Saat Ini */}
            <h3 className="text-xl sm:text-2xl font-bold text-gray-800 mt-12 mb-4 text-center">Daftar Hutang Sales (Invoice)</h3>
            <div className="mt-6 overflow-x-auto rounded-xl shadow-xl border border-gray-200">
              <table className="min-w-full divide-y divide-purple-200">
                <thead className="bg-purple-600 text-white">
                  <tr>
                    <th scope="col" className="px-3 py-3 sm:px-6 sm:py-4 text-left text-xs sm:text-sm font-bold uppercase tracking-wider rounded-tl-xl">Tanggal Hutang</th>
                    <th scope="col" className="px-3 py-3 sm:px-6 sm:py-4 text-left text-xs sm:text-sm font-bold uppercase tracking-wider">Tempo</th>
                    <th scope="col" className="px-3 py-3 sm:px-6 sm:py-4 text-left text-xs sm:text-sm font-bold uppercase tracking-wider">No. Invoice</th>
                    <th scope="col" className="px-3 py-3 sm:px-6 sm:py-4 text-left text-xs sm:text-sm font-bold uppercase tracking-wider">Nama Sales</th>
                    <th scope="col" className="px-3 py-3 sm:px-6 sm:py-4 text-left text-xs sm:text-sm font-bold uppercase tracking-wider">Jumlah Awal</th>
                    <th scope="col" className="px-3 py-3 sm:px-6 sm:py-4 text-left text-xs sm:text-sm font-bold uppercase tracking-wider">Sisa Hutang</th>
                    <th scope="col" className="px-3 py-3 sm:px-6 sm:py-4 text-left text-xs sm:text-sm font-bold uppercase tracking-wider">Status</th>
                    <th scope="col" className="px-3 py-3 sm:px-6 sm:py-4 text-left text-xs sm:text-sm font-bold uppercase tracking-wider rounded-tr-xl">Aksi</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {incomingGoodsDebtRecords.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="px-3 py-4 sm:px-6 sm:py-6 whitespace-nowrap text-sm sm:text-base text-gray-500 text-center italic">
                        Belum ada hutang tercatat.
                      </td>
                    </tr>
                  ) : (
                    incomingGoodsDebtRecords.map((hutang) => (
                      <tr key={hutang.id} className="hover:bg-purple-50 transition duration-100 ease-in-out">
                        <td className="px-3 py-4 sm:px-6 sm:py-4 whitespace-nowrap text-xs sm:text-sm font-medium text-gray-900">{formatDate(hutang.tanggalHutang)}</td>
                        <td className="px-3 py-4 sm:px-6 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-700">{formatDate(hutang.tempo) || 'N/A'}</td>
                        <td className="px-3 py-4 sm:px-6 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-700 font-semibold">{hutang.noInvoice}</td>
                        <td className="px-3 py-4 sm:px-6 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-700">{hutang.namaSales}</td>
                        <td className="px-3 py-4 sm:px-6 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-700">{formatCurrency(hutang.jumlahBarangMasuk)}</td>
                        <td className="px-3 py-4 sm:px-6 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-red-600 font-semibold">{formatCurrency(hutang.sisaHutang)}</td>
                        <td className="px-3 py-4 sm:px-6 sm:py-4 whitespace-nowrap text-xs sm:text-sm">
                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            hutang.statusPembayaran === 'Lunas' ? 'bg-green-100 text-green-800' :
                            hutang.statusPembayaran === 'Lunas Sebagian' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {hutang.statusPembayaran}
                          </span>
                        </td>
                        <td className="px-3 py-4 sm:px-6 sm:py-4 whitespace-nowrap text-xs sm:text-sm font-medium">
                          <button
                            onClick={() => showHistoryModal(hutang)}
                            className="text-blue-600 hover:text-blue-900 transition duration-150 ease-in-out mr-2"
                          >
                            Lihat Detail
                          </button>
                          <button
                            onClick={() => handleEditHutangEntry(hutang.id)}
                            className="text-indigo-600 hover:text-indigo-900 transition duration-150 ease-in-out"
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              <p className="text-right p-4 text-base sm:text-lg font-bold text-gray-800 bg-gray-100 rounded-b-xl">
                Total Sisa Hutang Keseluruhan: {formatCurrency(totalOutstandingHutang)}
              </p>
            </div>

            {/* Ringkasan Hutang per Sales (Fitur Baru) */}
            <h3 className="text-xl sm:text-2xl font-bold text-gray-800 mt-12 mb-4 text-center">Ringkasan Hutang per Sales</h3>
            <div className="mt-6 overflow-x-auto rounded-xl shadow-xl border border-gray-200">
                <table className="min-w-full divide-y divide-green-200">
                    <thead className="bg-green-600 text-white">
                        <tr>
                            <th scope="col" className="px-3 py-3 sm:px-6 sm:py-4 text-left text-xs sm:text-sm font-bold uppercase tracking-wider rounded-tl-xl">Nama Sales</th>
                            <th scope="col" className="px-3 py-3 sm:px-6 sm:py-4 text-left text-xs sm:text-sm font-bold uppercase tracking-wider">Total Hutang Awal</th>
                            <th scope="col" className="px-3 py-3 sm:px-6 sm:py-4 text-left text-xs sm:text-sm font-bold uppercase tracking-wider">Sisa Hutang</th>
                            <th scope="col" className="px-3 py-3 sm:px-6 sm:py-4 text-left text-xs sm:text-sm font-bold uppercase tracking-wider">Kunjungan Terakhir</th>
                            <th scope="col" className="px-3 py-3 sm:px-6 sm:py-4 text-left text-xs sm:text-sm font-bold uppercase tracking-wider rounded-tr-xl">Detail</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {Object.keys(debtSummaryBySales).length === 0 ? (
                            <tr>
                                <td colSpan="5" className="px-3 py-4 sm:px-6 sm:py-6 whitespace-nowrap text-sm sm:text-base text-gray-500 text-center italic">
                                    Belum ada ringkasan hutang per sales.
                                </td>
                            </tr>
                        ) : (
                            Object.entries(debtSummaryBySales).map(([salesName, data]) => (
                                <React.Fragment key={salesName}>
                                    <tr className="hover:bg-green-50 transition duration-100 ease-in-out cursor-pointer" onClick={() => {
                                        // Toggle detail invoices for this sales
                                        const updatedSummary = { ...debtSummaryBySales };
                                        updatedSummary[salesName].showInvoices = !updatedSummary[salesName].showInvoices;
                                        setIncomingGoodsDebtRecords([...incomingGoodsDebtRecords]); // Trigger re-render
                                    }}>
                                        <td className="px-3 py-4 sm:px-6 sm:py-4 whitespace-nowrap text-xs sm:text-sm font-bold text-gray-900">{salesName}</td>
                                        <td className="px-3 py-4 sm:px-6 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-700">{formatCurrency(data.totalDebt)}</td>
                                        <td className="px-3 py-4 sm:px-6 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-red-600 font-semibold">{formatCurrency(data.outstandingDebt)}</td>
                                        <td className="px-3 py-4 sm:px-6 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-700">{formatDate(data.lastVisitDate)}</td>
                                        <td className="px-3 py-4 sm:px-6 sm:py-4 whitespace-nowrap text-xs sm:text-sm font-medium">
                                            <button className="text-blue-600 hover:text-blue-900 transition duration-150 ease-in-out">
                                                {data.showInvoices ? 'Sembunyikan' : 'Lihat Invoice'}
                                            </button>
                                        </td>
                                    </tr>
                                    {/* Detail Invoice untuk Sales Tertentu */}
                                    {data.showInvoices && data.invoices.map(invoice => (
                                        <tr key={invoice.id} className="bg-gray-50 hover:bg-gray-100 transition duration-100 ease-in-out text-sm">
                                            <td className="pl-8 pr-3 py-2 whitespace-nowrap font-medium text-gray-700"></td> {/* Indent */}
                                            <td colSpan="4" className="pr-3 py-2">
                                                <div className="flex justify-between items-center text-xs">
                                                    <span>**Invoice:** {invoice.noInvoice}</span>
                                                    <span>**Hutang Awal:** {formatCurrency(invoice.jumlahBarangMasuk)}</span>
                                                    <span className="font-semibold text-red-600">**Sisa:** {formatCurrency(invoice.sisaHutang)}</span>
                                                    <span className={`px-2 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                                        invoice.statusPembayaran === 'Lunas' ? 'bg-green-100 text-green-800' :
                                                        invoice.statusPembayaran === 'Lunas Sebagian' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'
                                                    }`}>
                                                        {invoice.statusPembayaran}
                                                    </span>
                                                    <button
                                                        onClick={() => showHistoryModal(invoice)}
                                                        className="text-blue-600 hover:text-blue-900 transition duration-150 ease-in-out text-xs ml-2"
                                                    >
                                                        Riwayat Bayar
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </React.Fragment>
                            ))
                        )}
                    </tbody>
                </table>
            </div>


            {/* Bagian Gemini AI untuk Pengingat Hutang */}
            <div className="mt-12 p-4 sm:p-6 bg-blue-50 rounded-lg shadow-inner border border-blue-200">
                <h3 className="text-xl sm:text-2xl font-bold text-blue-700 mb-4">✨ Pembuat Catatan Pengingat Hutang ✨</h3>
                <p className="text-gray-700 mb-4">Pilih invoice dari daftar di atas, lalu klik tombol untuk membuat draf pengingat.</p>
                <div className="mb-4">
                    <label htmlFor="selectInvoiceForReminder" className="block text-sm font-semibold text-gray-700 mb-1">Pilih Invoice:</label>
                    <select
                        id="selectInvoiceForReminder"
                        value={selectedInvoiceForHistory ? selectedInvoiceForHistory.noInvoice : ''}
                        onChange={(e) => {
                            const selected = incomingGoodsDebtRecords.find(inv => inv.noInvoice === e.target.value);
                            setSelectedInvoiceForHistory(selected);
                            setGeminiReminderText(''); // Clear previous reminder
                        }}
                        className="mt-1 block w-full px-3 py-2 sm:px-4 sm:py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base"
                    >
                        <option value="">-- Pilih Invoice yang Belum Lunas --</option>
                        {outstandingInvoices.map(invoice => (
                            <option key={invoice.id} value={invoice.noInvoice}>
                                {invoice.noInvoice} - {invoice.namaSales} (Sisa: {formatCurrency(invoice.sisaHutang)})
                            </option>
                        ))}
                    </select>
                </div>
                <button
                    onClick={() => selectedInvoiceForHistory && generateDebtReminder(selectedInvoiceForHistory)}
                    disabled={!selectedInvoiceForHistory || isGeneratingReminder}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-75 transition duration-200 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isGeneratingReminder ? 'Membuat...' : 'Buat Pengingat'}
                </button>
                {geminiReminderText && (
                    <div className="mt-4 p-4 bg-white rounded-lg border border-gray-300 shadow-sm">
                        <h4 className="font-semibold text-gray-800 mb-2">Draf Pengingat:</h4>
                        <p className="whitespace-pre-wrap text-gray-700 text-sm">{geminiReminderText}</p>
                        <button
                            onClick={() => document.execCommand('copy')}
                            className="mt-3 bg-gray-200 hover:bg-gray-300 text-gray-800 text-xs font-semibold py-1 px-2 rounded-lg"
                        >
                            Salin Teks
                        </button>
                    </div>
                )}
            </div>
          </div>
        )}

        {/* --- Konten Tab Laporan Bulanan --- */}
        {activeTab === 'report' && (
          <div id="monthly-report-section" className="relative">
            <h2 className="text-2xl sm:text-3xl font-bold text-blue-700 mb-6 text-center">Laporan Keuangan Bulanan</h2>

            {/* Pemilihan Bulan dan Tahun untuk Laporan */}
            <div className="flex flex-col sm:flex-row justify-center items-center gap-4 mb-8 p-4 bg-lime-50 rounded-lg shadow-inner border border-lime-200">
              <label htmlFor="selectMonth" className="font-semibold text-gray-700">Pilih Bulan:</label>
              <select
                id="selectMonth"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                className="px-3 py-2 sm:px-4 sm:py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-lime-500 focus:border-lime-500 text-sm sm:text-base"
              >
                {[...Array(12).keys()].map(i => (
                  <option key={i + 1} value={i + 1}>
                    {new Date(0, i).toLocaleString('id-ID', { month: 'long' })}
                  </option>
                ))}
              </select>

              <label htmlFor="selectYear" className="font-semibold text-gray-700">Pilih Tahun:</label>
              <select
                id="selectYear"
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                className="px-3 py-2 sm:px-4 sm:py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-lime-500 focus:focus:border-lime-500 text-sm sm:text-base"
              >
                {years.map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>

              <button
                onClick={handleDownloadPdf}
                className="mt-4 sm:mt-0 bg-teal-600 hover:bg-teal-700 text-white font-bold py-2 px-4 rounded-lg shadow-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-opacity-75 transition duration-200 ease-in-out transform hover:scale-105 text-sm sm:text-base"
              >
                Unduh Laporan PDF
              </button>
            </div>

            {/* Bagian untuk menampilkan analisis AI */}
            <div className="mt-6 p-4 sm:p-6 bg-teal-50 rounded-lg shadow-inner border border-teal-200">
                <h3 className="text-xl sm:text-2xl font-bold text-teal-700 mb-4">✨ Analisis Keuangan Bulan Ini ✨</h3>
                <p className="text-gray-700 mb-4">Dapatkan analisis singkat dan saran keuangan berdasarkan data laporan bulanan yang Anda pilih.</p>
                <button
                    onClick={generateMonthlyAnalysis}
                    disabled={isGeneratingAnalysis}
                    className="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold py-2 px-4 rounded-lg shadow-md focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-opacity-75 transition duration-200 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isGeneratingAnalysis ? 'Menganalisis...' : 'Dapatkan Analisis'}
                </button>
                {geminiAnalysisText && (
                    <div className="mt-4 p-4 bg-white rounded-lg border border-gray-300 shadow-sm">
                        <h4 className="font-semibold text-gray-800 mb-2">Analisis AI:</h4>
                        <p className="whitespace-pre-wrap text-gray-700 text-sm">{geminiAnalysisText}</p>
                    </div>
                )}
            </div>

            {/* Konten Laporan yang bisa di-print */}
            <div ref={laporanRef} className="p-4 sm:p-6 bg-white rounded-lg shadow-md print-area mt-8">
              <h3 className="text-xl sm:text-2xl font-bold text-gray-800 mt-12 mb-4 text-center">Laporan Keuangan Bulan {new Date(selectedYear, selectedMonth - 1).toLocaleString('id-ID', { month: 'long', year: 'numeric' })}</h3>

              {/* Tabel Ringkasan Bulanan */}
              <div className="mt-6 overflow-x-auto rounded-xl shadow-xl border border-gray-200 mb-8">
                <table className="min-w-full divide-y divide-lime-200">
                  <thead className="bg-lime-600 text-white">
                    <tr>
                      <th scope="col" className="px-3 py-3 sm:px-6 sm:py-4 text-left text-xs sm:text-sm font-bold uppercase tracking-wider rounded-tl-xl">Kategori</th>
                      <th scope="col" className="px-3 py-3 sm:px-6 sm:py-4 text-left text-xs sm:text-sm font-bold uppercase tracking-wider rounded-tr-xl">Jumlah</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    <tr className="bg-green-50">
                      <td className="px-3 py-3 sm:px-6 sm:py-4 whitespace-nowrap text-sm sm:text-base font-semibold text-green-700">Total Penjualan Tunai Bulan Ini</td>
                      <td className="px-3 py-3 sm:px-6 sm:py-4 whitespace-nowrap text-sm sm:text-base font-semibold text-green-700">{formatCurrency(monthlyTotals.totalPenjualanTunai)}</td>
                    </tr>
                    <tr className="bg-red-50">
                      <td className="px-3 py-3 sm:px-6 sm:py-4 whitespace-nowrap text-sm sm:text-base font-semibold text-red-700">Total Pengeluaran Harian Bulan Ini</td>
                      <td className="px-3 py-3 sm:px-6 sm:py-4 whitespace-nowrap text-sm sm:text-base font-semibold text-red-700">{formatCurrency(monthlyTotals.totalPengeluaranHarian)}</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-3 sm:px-6 sm:py-4 whitespace-nowrap text-sm sm:text-base font-medium text-gray-700">Total Uang Simpan Bulan Ini</td>
                      <td className="px-3 py-3 sm:px-6 sm:py-4 whitespace-nowrap text-sm sm:text-base font-medium text-gray-700">{formatCurrency(monthlyTotals.totalUangSimpan)}</td>
                    </tr>
                    <tr className="bg-blue-50">
                      <td className="px-3 py-3 sm:px-6 sm:py-4 whitespace-nowrap text-sm sm:text-base font-medium text-blue-700">Total Hutang Baru Dibuat Bulan Ini</td>
                      <td className="px-3 py-3 sm:px-6 sm:py-4 whitespace-nowrap text-sm sm:text-base font-medium text-blue-700">{formatCurrency(monthlyTotals.totalHutangBaruDibuat)}</td>
                    </tr>
                    <tr className="bg-purple-50">
                      <td className="px-3 py-3 sm:px-6 sm:py-4 whitespace-nowrap text-sm sm:text-base font-medium text-purple-700">Total Pembayaran Hutang Sales Bulan Ini</td>
                      <td className="px-3 py-3 sm:px-6 sm:py-4 whitespace-nowrap text-sm sm:text-base font-medium text-purple-700">{formatCurrency(monthlyTotals.totalPembayaranHutangSalesDetail)}</td>
                    </tr>
                    <tr className="bg-gray-100">
                      <td className="px-3 py-3 sm:px-6 sm:py-4 whitespace-nowrap text-base sm:text-lg font-bold text-gray-900">Perkiraan Saldo Akhir Bulan</td>
                      <td className="px-3 py-3 sm:px-6 sm:py-4 whitespace-nowrap text-base sm:text-lg font-bold text-gray-900">
                        {formatCurrency(
                          dailyRecords.length > 0 ? dailyRecords[dailyRecords.length - 1].saldoHariIni : 0
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <h3 className="text-xl sm:text-2xl font-bold text-gray-800 mt-12 mb-4 text-center">Detail Transaksi Harian Bulan Ini</h3>
              <div className="mt-6 overflow-x-auto rounded-xl shadow-xl border border-gray-200">
                <table className="min-w-full divide-y divide-blue-200">
                  <thead className="bg-blue-600 text-white">
                    <tr>
                      <th scope="col" className="px-3 py-3 sm:px-6 sm:py-4 text-left text-xs sm:text-sm font-bold uppercase tracking-wider rounded-tl-xl">Tanggal</th>
                      <th scope="col" className="px-3 py-3 sm:px-6 sm:py-4 text-left text-xs sm:text-sm font-bold uppercase tracking-wider">Total Penjualan</th>
                      <th scope="col" className="px-3 py-3 sm:px-6 sm:py-4 text-left text-xs sm:text-sm font-bold uppercase tracking-wider">Total Pengeluaran</th>
                      <th scope="col" className="px-3 py-3 sm:px-6 sm:py-4 text-left text-xs sm:text-sm font-bold uppercase tracking-wider">Saldo Hari Ini</th>
                      <th scope="col" className="px-3 py-3 sm:px-6 sm:py-4 text-left text-xs sm:text-sm font-bold uppercase tracking-wider">Baki Semalam</th>
                      <th scope="col" className="px-3 py-3 sm:px-6 sm:py-4 text-left text-xs sm:text-sm font-bold uppercase tracking-wider">Uang Simpan</th>
                      <th scope="col" className="px-3 py-3 sm:px-6 sm:py-4 text-left text-xs sm:text-sm font-bold uppercase tracking-wider rounded-tr-xl">Lihat Detail</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredDailyRecords.length === 0 ? (
                      <tr>
                        <td colSpan="7" className="px-3 py-4 sm:px-6 sm:py-6 whitespace-nowrap text-sm sm:text-base text-gray-500 text-center italic">
                          Tidak ada transaksi harian untuk bulan yang dipilih.
                        </td>
                      </tr>
                    ) : (
                      filteredDailyRecords.map((entry) => (
                        <tr key={entry.id} className="hover:bg-blue-50 transition duration-100 ease-in-out">
                          <td className="px-3 py-4 sm:px-6 sm:py-4 whitespace-nowrap text-xs sm:text-sm font-medium text-gray-900">{formatDate(entry.tanggal)}</td>
                          <td className="px-3 py-4 sm:px-6 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-green-600 font-semibold">{formatCurrency(entry.penjualanTunaiCalculated)}</td>
                          <td className="px-3 py-4 sm:px-6 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-red-700 font-semibold">{formatCurrency(entry.totalPengeluaranHarian)}</td>
                          <td className="px-3 py-4 sm:px-6 sm:py-4 whitespace-nowrap text-xs sm:text-sm font-bold text-gray-800">{formatCurrency(entry.saldoHariIni)}</td>
                          <td className="px-3 py-4 sm:px-6 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-700">{formatCurrency(entry.bakiSemalam)}</td>
                          <td className="px-3 py-4 sm:px-6 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-blue-600">{formatCurrency(entry.uangSimpan)}</td>
                          <td className="px-3 py-4 sm:px-6 sm:py-4 whitespace-nowrap text-xs sm:text-sm font-medium">
                            <button
                              onClick={() => showDailyDetailModal(entry)}
                              className="text-blue-600 hover:text-blue-900 transition duration-150 ease-in-out"
                            >
                              Lihat Detail
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <h3 className="text-xl sm:text-2xl font-bold text-gray-800 mt-12 mb-4 text-center">Ringkasan Hutang Sales Bulan Ini</h3>
              <div className="mt-6 overflow-x-auto rounded-xl shadow-xl border border-gray-200">
                <table className="min-w-full divide-y divide-purple-200">
                  <thead className="bg-purple-600 text-white">
                    <tr>
                      <th scope="col" className="px-3 py-3 sm:px-6 sm:py-4 text-left text-xs sm:text-sm font-bold uppercase tracking-wider rounded-tl-xl">Tanggal Hutang</th>
                      <th scope="col" className="px-3 py-3 sm:px-6 sm:py-4 text-left text-xs sm:text-sm font-bold uppercase tracking-wider">Tempo</th>
                      <th scope="col" className="px-3 py-3 sm:px-6 sm:py-4 text-left text-xs sm:text-sm font-bold uppercase tracking-wider">No. Invoice</th>
                      <th scope="col" className="px-3 py-3 sm:px-6 sm:py-4 text-left text-xs sm:text-sm font-bold uppercase tracking-wider">Nama Sales</th>
                      <th scope="col" className="px-3 py-3 sm:px-6 sm:py-4 text-left text-xs sm:text-sm font-bold uppercase tracking-wider">Jumlah Awal</th>
                      <th scope="col" className="px-3 py-3 sm:px-6 sm:py-4 text-left text-xs sm:text-sm font-bold uppercase tracking-wider">Sisa Hutang</th>
                      <th scope="col" className="px-3 py-3 sm:px-6 sm:py-4 text-left text-xs sm:text-sm font-bold uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {incomingGoodsDebtRecords.filter(debt => {
                        const debtDate = new Date(debt.tanggalHutang);
                        return debtDate.getMonth() + 1 === parseInt(selectedMonth) && debtDate.getFullYear() === parseInt(selectedYear);
                    }).length === 0 ? (
                      <tr>
                        <td colSpan="8" className="px-3 py-4 sm:px-6 sm:py-6 whitespace-nowrap text-sm sm:text-base text-gray-500 text-center italic">
                          Tidak ada hutang baru tercatat untuk bulan ini.
                        </td>
                      </tr>
                    ) : (
                      incomingGoodsDebtRecords.filter(debt => {
                          const debtDate = new Date(debt.tanggalHutang);
                          return debtDate.getMonth() + 1 === parseInt(selectedMonth) && debtDate.getFullYear() === parseInt(selectedYear);
                      }).map((hutang) => (
                        <tr key={hutang.id} className="hover:bg-purple-50 transition duration-100 ease-in-out">
                          <td className="px-3 py-4 sm:px-6 sm:py-4 whitespace-nowrap text-xs sm:text-sm font-medium text-gray-900">{formatDate(hutang.tanggalHutang)}</td>
                          <td className="px-3 py-4 sm:px-6 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-700">{formatDate(hutang.tempo) || 'N/A'}</td>
                          <td className="px-3 py-4 sm:px-6 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-700 font-semibold">{hutang.noInvoice}</td>
                          <td className="px-3 py-4 sm:px-6 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-700">{hutang.namaSales}</td>
                          <td className="px-3 py-4 sm:px-6 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-700">{formatCurrency(hutang.jumlahBarangMasuk)}</td>
                          <td className="px-3 py-4 sm:px-6 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-red-600 font-semibold">{formatCurrency(hutang.sisaHutang)}</td>
                          <td className="px-3 py-4 sm:px-6 sm:py-4 whitespace-nowrap text-xs sm:text-sm">
                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                              hutang.statusPembayaran === 'Lunas' ? 'bg-green-100 text-green-800' :
                              hutang.statusPembayaran === 'Lunas Sebagian' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'
                            }`}>
                              {hutang.statusPembayaran}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
