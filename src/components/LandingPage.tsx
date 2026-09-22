import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  PlusCircle,
  MapPin,
  Clock,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ShieldCheck,
  X,
  Upload,
  RefreshCw,
} from 'lucide-react';
import { LostFoundItem, VerificationRole, VerificationQuestion } from '../types';
import { MatchVerificationModal } from './MatchVerificationModal';
import { PrivateVerificationEditor } from './PrivateVerificationEditor';
import { SearchableCategorySelect } from './SearchableCategorySelect';
import { ReportDateTimePicker, DateTimeValue } from './ReportDateTimePicker';
import { ITEM_CATEGORIES, normalizeCategory } from '../data/categories';
import { useAuth } from '../context/AuthContext';
import { UserMenu } from './auth/UserMenu';
import { AuthModal, AuthModalMode } from './auth/AuthModal';
import { uploadItemImage, UploadedImageRef } from '../lib/upload';
import { fetchItems, createItemReport } from '../lib/itemsApi';

interface LandingPageProps {
  onReplayIntro?: () => void;
  onClearSession?: () => void;
  onToggleReducedMotion?: () => void;
  reducedMotionActive?: boolean;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  reducedMotionActive,
}) => {
  // ---------------------------------------------------------------------
  // Persistent items (Supabase via /api/items; dev fallback while
  // Supabase credentials are absent). INITIAL_ITEMS removed — the database
  // is the source of truth; demo items are seeded server-side on boot.
  // ---------------------------------------------------------------------
  const [items, setItems] = useState<LostFoundItem[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(true);
  const [itemsError, setItemsError] = useState<string | null>(null);

  const loadItems = useCallback(async () => {
    setIsLoadingItems(true);
    setItemsError(null);
    const result = await fetchItems();
    if (result.error) {
      setItemsError(result.error);
    }
    setItems(result.items);
    setIsLoadingItems(false);
  }, []);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const [filterType, setFilterType] = useState<'all' | 'lost' | 'found' | 'matched'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [reportModalType, setReportModalType] = useState<'lost' | 'found' | null>(null);
  const [reportSuccessMessage, setReportSuccessMessage] = useState('');

  // Authentication modal states
  const { verifyEmail, user } = useAuth();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [authModalMode, setAuthModalMode] = useState<AuthModalMode>('login');
  const [resetTokenParam, setResetTokenParam] = useState<string>('');

  // Handle URL tokens for Reset Password and Email Verification
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const rToken = params.get('resetToken');
      const vToken = params.get('verifyToken');

      if (rToken) {
        setResetTokenParam(rToken);
        setAuthModalMode('reset');
        setIsAuthModalOpen(true);
      } else if (vToken) {
        verifyEmail(vToken).then((res) => {
          if (res.success) {
            setReportSuccessMessage('Email verified successfully! Welcome to FoundIt.');
            setTimeout(() => setReportSuccessMessage(''), 5000);
          }
        });
      }
    } catch {
      // ignore
    }
  }, [verifyEmail]);

  // Form states for new report
  const [reportImage, setReportImage] = useState<string>('');
  // Supabase Storage reference for the uploaded photo (null = local preview only)
  const [uploadedImageRef, setUploadedImageRef] = useState<UploadedImageRef | null>(null);
  const [uploadFailed, setUploadFailed] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [reportTitle, setReportTitle] = useState('');
  const [reportCategory, setReportCategory] = useState<string>('Wallet / Money');
  const [reportTime, setReportTime] = useState('');
  const [reportTimeDetails, setReportTimeDetails] = useState<DateTimeValue | null>(null);
  const [reportLocation, setReportLocation] = useState('');
  const [reportCondition, setReportCondition] = useState('Good');
  const [reportFeatures, setReportFeatures] = useState('');
  const [reportQuestions, setReportQuestions] = useState<VerificationQuestion[]>([]);
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Verification modal state
  const [activeVerification, setActiveVerification] = useState<{
    item: LostFoundItem;
    role: VerificationRole;
  } | null>(null);

  const quickCategories = [
    { id: 'all', label: 'All Items' },
    { id: 'Wallet / Money', label: 'Wallets & Money' },
    { id: 'Keys', label: 'Keys' },
    { id: 'Phone / Tablet', label: 'Phones & Tech' },
    { id: 'Bags / Backpacks', label: 'Bags' },
    { id: 'Glasses', label: 'Glasses' },
    { id: 'Pets / Animals', label: 'Pets' },
  ];

  const filteredItems = items.filter((item) => {
    if (filterType === 'lost' && item.type !== 'lost') return false;
    if (filterType === 'found' && item.type !== 'found') return false;
    if (filterType === 'matched' && item.status !== 'matched' && item.status !== 'returned') return false;

    if (selectedCategory !== 'all') {
      const itemCatNorm = normalizeCategory(item.category).toLowerCase();
      const selCatNorm = normalizeCategory(selectedCategory).toLowerCase();
      if (!itemCatNorm.includes(selCatNorm) && !selCatNorm.includes(itemCatNorm)) {
        return false;
      }
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        item.title.toLowerCase().includes(q) ||
        item.location.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleOpenVerification = (item: LostFoundItem, role: VerificationRole) => {
    setActiveVerification({ item, role });
  };

  const handleItemReturned = async (itemId: string) => {
    // Persist status when the current user owns the item; optimistic local
    // update keeps the existing modal behavior unchanged.
    setItems((prev) =>
      prev.map((it) => (it.id === itemId ? { ...it, status: 'returned' } : it))
    );
    try {
      const { updateItemStatus } = await import('../lib/itemsApi');
      const ok = await updateItemStatus(itemId, 'returned');
      if (!ok) {
        // Not the owner (e.g. demo items) — reload to restore server state.
        loadItems();
      }
    } catch {
      // keep optimistic state
    }
    setReportSuccessMessage('Status updated: Item returned to verified owner!');
    setTimeout(() => setReportSuccessMessage(''), 4500);
  };

  const handleImageFile = (file: File) => {
    if (!file) return;

    // 1) Instant local preview — existing UX preserved exactly.
    const reader = new FileReader();
    reader.onload = () => {
      setReportImage(reader.result as string);
    };
    reader.readAsDataURL(file);

    // 2) Persist to Supabase Storage in the background. Requires sign-in;
    //    failures are surfaced honestly instead of pretending it saved.
    setUploadedImageRef(null);
    setUploadFailed(null);
    if (!user) {
      setUploadFailed('Sign in so your photo is saved permanently with the report.');
      return;
    }
    setIsUploadingImage(true);
    uploadItemImage(file)
      .then((result) => {
        if (result.success && result.image) {
          setUploadedImageRef(result.image);
        } else {
          setUploadFailed(result.error || 'Photo could not be saved. It will not persist.');
        }
      })
      .finally(() => setIsUploadingImage(false));
  };

  const handleImageDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleImageFile(file);
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleImageFile(file);
  };

  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportTitle.trim() || !reportLocation.trim()) return;
    if (!user) {
      // Keep the report modal open and prompt authentication — never pretend
      // the report was saved when it wasn't.
      setAuthModalMode('login');
      setIsAuthModalOpen(true);
      setReportSuccessMessage('Please sign in first so your report can be saved.');
      setTimeout(() => setReportSuccessMessage(''), 4500);
      return;
    }
    if (uploadFailed && !uploadedImageRef) {
      setReportSuccessMessage(
        'Heads up: the photo could not be saved, so the report will be published without a persisted image.'
      );
      setTimeout(() => setReportSuccessMessage(''), 4500);
    }

    setIsSubmittingReport(true);
    try {
      // Map PrivateVerificationEditor questions to the server payload.
      const questions = reportQuestions.map((q) => ({
        question: q.question,
        question_type: q.answerType,
        options: q.options ?? null,
        correct_answer: q.correctAnswer,
        weight: q.weight ?? 1,
        required: true,
        is_private: true,
      }));

      const result = await createItemReport({
        type: reportModalType || 'lost',
        title: reportTitle.trim(),
        category: reportCategory,
        description: reportFeatures.trim() || 'No additional features specified.',
        item_date_time: reportTimeDetails?.date
          ? combineDateAndMode(reportTimeDetails)
          : null,
        time_precision: reportTimeDetails?.timeMode ?? 'unknown',
        location: reportLocation.trim(),
        distinguishing_features: reportCondition ? `Condition: ${reportCondition}` : '',
        questions: questions.length > 0 ? questions : undefined,
        images: uploadedImageRef
          ? [
              {
                storage_path: uploadedImageRef.storage_path,
                image_url: uploadedImageRef.image_url,
              },
            ]
          : undefined,
      });

      if (!result.success || !result.item) {
        setReportSuccessMessage(result.error || 'Failed to publish report.');
        setTimeout(() => setReportSuccessMessage(''), 5000);
        return;
      }

      // Show the persisted item immediately (it now has a server id).
      setItems((prev) => [result.item!, ...prev]);
      setReportTitle('');
      setReportCategory('Wallet / Money');
      setReportTime('');
      setReportTimeDetails(null);
      setReportLocation('');
      setReportCondition('Good');
      setReportFeatures('');
      setReportImage('');
      setUploadedImageRef(null);
      setUploadFailed(null);
      setReportQuestions([]);
      setReportModalType(null);
      setReportSuccessMessage(
        `Successfully published ${result.item.type === 'lost' ? 'Lost' : 'Found'} report!`
      );
      setTimeout(() => setReportSuccessMessage(''), 4500);
    } finally {
      setIsSubmittingReport(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F6F3EC] text-[#1B1812] flex flex-col font-sans selection:bg-[#E8A33D]/30 selection:text-[#1B1812]">
      {/* Main Navigation */}
      <header className="border-b border-[#1B1812]/10 bg-[#F6F3EC]/90 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-20 flex items-center justify-between">
          {/* Brand Logo matching the intro wordmark typeface */}
          <div className="flex items-center gap-3">
            <div className="flex items-baseline">
              <span className="font-fraunces text-3xl sm:text-4xl font-[450] tracking-[-0.03em] text-[#1B1812]">
                FoundIt
              </span>
              <span className="ml-1 text-xl text-[#E8A33D] leading-none">.</span>
            </div>
            <span className="hidden md:inline-block px-2.5 py-0.5 text-[11px] font-medium tracking-wide uppercase rounded border border-[#1B1812]/15 text-[#1B1812]/70">
              Matching Network
            </span>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2.5 sm:gap-3">
            <button
              id="report-lost-header-btn"
              onClick={() => {
                setReportImage('');
                setUploadedImageRef(null);
                setUploadFailed(null);
                setReportModalType('lost');
              }}
              className="px-3 py-1.5 sm:px-3.5 sm:py-2 text-xs sm:text-sm font-medium border border-[#1B1812]/20 rounded-md hover:border-[#1B1812] text-[#1B1812] transition-all cursor-pointer"
            >
              Report Lost
            </button>

            <button
              id="report-found-header-btn"
              onClick={() => {
                setReportImage('');
                setUploadedImageRef(null);
                setUploadFailed(null);
                setReportModalType('found');
              }}
              className="px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium bg-[#1B1812] text-[#F6F3EC] rounded-md hover:bg-[#1B1812]/90 transition-all cursor-pointer inline-flex items-center gap-1.5 shadow-xs"
            >
              <PlusCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#E8A33D]" />
              <span>Report Found</span>
            </button>

            {/* Authentication User Menu */}
            <div className="pl-1 sm:pl-2 border-l border-[#1B1812]/15">
              <UserMenu
                onOpenAuth={(m) => {
                  setAuthModalMode(m);
                  setIsAuthModalOpen(true);
                }}
              />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-10 sm:py-14 space-y-12">
        {/* Hero Section */}
        <section className="space-y-6 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#1B1812]/12 bg-[#F6F3EC] text-xs text-[#1B1812]/80">
            <Sparkles className="w-3.5 h-3.5 text-[#E8A33D]" />
            <span>Smart algorithmic matching across transit, campus &amp; city spots</span>
          </div>

          <h1 className="font-fraunces text-4xl sm:text-5xl md:text-6xl font-[450] leading-[1.08] tracking-[-0.03em] text-[#1B1812]">
            Lost something precious?
            <span className="block font-normal text-[#1B1812]/70 italic mt-1">
              Found something that belongs to someone else?
            </span>
          </h1>

          <p className="text-base sm:text-lg text-[#1B1812]/80 font-normal max-w-2xl leading-relaxed">
            FoundIt connects lost items with their finders in minutes through visual match
            heuristics, location timestamps, and verified handoffs.
          </p>

          {/* Search Box */}
          <div className="pt-2">
            <div className="relative flex items-center rounded-lg border border-[#1B1812]/20 bg-[#F6F3EC] shadow-xs focus-within:border-[#1B1812] transition-all">
              <div className="pl-4 text-[#1B1812]/40">
                <Search className="w-5 h-5 text-[#E8A33D]" />
              </div>
              <input
                id="search-items-input"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by keywords (e.g. 'tan wallet', 'AirPods', 'Grand Central')..."
                className="w-full px-3 py-3.5 bg-transparent text-sm sm:text-base placeholder:text-[#1B1812]/40 focus:outline-hidden text-[#1B1812]"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="pr-4 text-[#1B1812]/40 hover:text-[#1B1812] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Filter Toolbar & Statistics */}
        <section className="space-y-4 pt-2 border-t border-[#1B1812]/10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            {/* Status Pills */}
            <div className="flex items-center gap-1.5 p-1 rounded-lg border border-[#1B1812]/15 bg-[#1B1812]/[0.02]">
              <button
                id="filter-all-btn"
                onClick={() => setFilterType('all')}
                className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded transition-all cursor-pointer ${
                  filterType === 'all'
                    ? 'bg-[#1B1812] text-[#F6F3EC]'
                    : 'text-[#1B1812]/70 hover:text-[#1B1812]'
                }`}
              >
                All Reports
              </button>
              <button
                id="filter-lost-btn"
                onClick={() => setFilterType('lost')}
                className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded transition-all cursor-pointer ${
                  filterType === 'lost'
                    ? 'bg-[#1B1812] text-[#F6F3EC]'
                    : 'text-[#1B1812]/70 hover:text-[#1B1812]'
                }`}
              >
                Lost Items
              </button>
              <button
                id="filter-found-btn"
                onClick={() => setFilterType('found')}
                className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded transition-all cursor-pointer ${
                  filterType === 'found'
                    ? 'bg-[#1B1812] text-[#F6F3EC]'
                    : 'text-[#1B1812]/70 hover:text-[#1B1812]'
                }`}
              >
                Found Items
              </button>
              <button
                id="filter-matched-btn"
                onClick={() => setFilterType('matched')}
                className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded transition-all cursor-pointer ${
                  filterType === 'matched'
                    ? 'bg-[#1B1812] text-[#F6F3EC]'
                    : 'text-[#1B1812]/70 hover:text-[#1B1812]'
                }`}
              >
                Recent Matches
              </button>
            </div>

            {/* Total Results */}
            <div className="text-xs text-[#1B1812]/60 font-medium">
              Showing {filteredItems.length} registered {filteredItems.length === 1 ? 'item' : 'items'}
            </div>
          </div>

          {/* Category Chips with Expanded Categories selector */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
            {quickCategories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3 py-1.5 text-xs rounded-full border transition-all whitespace-nowrap cursor-pointer ${
                  selectedCategory === cat.id
                    ? 'border-[#1B1812] bg-[#1B1812] text-[#F6F3EC]'
                    : 'border-[#1B1812]/15 bg-transparent text-[#1B1812]/70 hover:border-[#1B1812]/40 hover:text-[#1B1812]'
                }`}
              >
                {cat.label}
              </button>
            ))}

            {/* Additional Categories Dropdown for fast filter */}
            <select
              value={quickCategories.some((c) => c.id === selectedCategory) ? '' : selectedCategory}
              onChange={(e) => {
                if (e.target.value) setSelectedCategory(e.target.value);
              }}
              className="px-2.5 py-1 text-xs rounded-full border border-[#1B1812]/20 bg-transparent text-[#1B1812]/80 focus:border-[#1B1812] focus:outline-hidden cursor-pointer"
            >
              <option value="">More Categories...</option>
              {ITEM_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
        </section>

        {/* Loading State */}
        {isLoadingItems && (
          <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="border border-[#1B1812]/12 rounded-xl p-5 sm:p-6 bg-[#F6F3EC] animate-pulse"
              >
                <div className="aspect-16/10 rounded-lg bg-[#1B1812]/[0.06] mb-4" />
                <div className="h-4 w-24 bg-[#1B1812]/[0.06] rounded mb-3" />
                <div className="h-5 w-3/4 bg-[#1B1812]/[0.08] rounded mb-2" />
                <div className="h-3 w-full bg-[#1B1812]/[0.05] rounded mb-1.5" />
                <div className="h-3 w-5/6 bg-[#1B1812]/[0.05] rounded" />
              </div>
            ))}
          </section>
        )}

        {/* Error State */}
        {!isLoadingItems && itemsError && (
          <section className="max-w-xl mx-auto text-center border border-[#1B1812]/15 rounded-xl p-8 bg-[#1B1812]/[0.02] space-y-3">
            <AlertCircle className="w-8 h-8 text-[#E8A33D] mx-auto" />
            <h3 className="font-fraunces text-lg font-medium text-[#1B1812]">
              Couldn&apos;t load the listings
            </h3>
            <p className="text-xs text-[#1B1812]/70">{itemsError}</p>
            <button
              type="button"
              onClick={loadItems}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-[#1B1812] text-[#F6F3EC] rounded hover:bg-[#1B1812]/90 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5 text-[#E8A33D]" />
              <span>Try Again</span>
            </button>
          </section>
        )}

        {/* Empty State */}
        {!isLoadingItems && !itemsError && filteredItems.length === 0 && (
          <section className="max-w-xl mx-auto text-center border border-dashed border-[#1B1812]/20 rounded-xl p-10 space-y-3">
            <Search className="w-8 h-8 text-[#E8A33D] mx-auto" />
            <h3 className="font-fraunces text-lg font-medium text-[#1B1812]">
              {items.length === 0
                ? 'No items reported yet'
                : 'No items match your search or filters'}
            </h3>
            <p className="text-xs text-[#1B1812]/70">
              {items.length === 0
                ? 'Be the first to report a lost or found item in your area.'
                : 'Try a different keyword or clear the filters.'}
            </p>
          </section>
        )}

        {/* Item Feed Grid with Images */}
        {!isLoadingItems && !itemsError && filteredItems.length > 0 && (
          <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredItems.map((item) => {
              return (
                <article
                  key={item.id}
                  id={`item-card-${item.id}`}
                  className="group border border-[#1B1812]/12 rounded-xl p-5 sm:p-6 bg-[#F6F3EC] hover:border-[#1B1812]/30 transition-all flex flex-col justify-between"
                >
                  <div className="space-y-4">
                    {/* Item Image at Top of Card */}
                    {item.imageUrl && (
                      <div className="aspect-16/10 rounded-lg overflow-hidden border border-[#1B1812]/10 bg-neutral-100 relative">
                        <img
                          src={item.imageUrl}
                          alt={item.title}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-300"
                        />
                        {item.status === 'returned' && (
                          <div className="absolute inset-0 bg-[#1B1812]/60 backdrop-blur-xs flex items-center justify-center">
                            <span className="px-3 py-1 bg-[#E8A33D] text-[#1B1812] font-semibold text-xs rounded-md shadow-sm">
                              ✓ RETURNED TO OWNER
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Header Badges */}
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`text-[11px] font-semibold tracking-wider uppercase px-2.5 py-0.5 rounded border ${
                          item.type === 'lost'
                            ? 'border-[#1B1812]/30 bg-transparent text-[#1B1812]'
                            : 'border-[#E8A33D] bg-[#E8A33D]/10 text-[#1B1812]'
                        }`}
                      >
                        {item.type === 'lost' ? 'Lost Item' : 'Found Item'}
                      </span>

                      {item.status === 'matched' && item.matchConfidence ? (
                        <span className="text-[11px] font-medium text-[#E8A33D] flex items-center gap-1 bg-[#E8A33D]/10 px-2 py-0.5 rounded">
                          <Sparkles className="w-3 h-3 text-[#E8A33D]" />
                          <span>{item.matchConfidence}% Match</span>
                        </span>
                      ) : item.status === 'returned' ? (
                        <span className="text-[11px] font-medium text-emerald-800 flex items-center gap-1 bg-emerald-100/60 px-2 py-0.5 rounded">
                          <CheckCircle2 className="w-3 h-3 text-emerald-700" />
                          <span>Returned</span>
                        </span>
                      ) : item.reward ? (
                        <span className="text-[11px] font-medium text-[#1B1812]/80 bg-[#1B1812]/5 px-2 py-0.5 rounded">
                          {item.reward}
                        </span>
                      ) : (
                        <span className="text-[11px] text-[#1B1812]/50">{item.timeAgo}</span>
                      )}
                    </div>

                    {/* Title & Description */}
                    <div className="space-y-1.5">
                      <h3 className="font-fraunces text-xl font-medium text-[#1B1812] group-hover:text-[#1B1812] transition-colors leading-snug">
                        {item.title}
                      </h3>
                      <p className="text-xs text-[#1B1812]/75 leading-relaxed line-clamp-2">
                        {item.description}
                      </p>
                    </div>

                    {/* Location & Time Stamp */}
                    <div className="space-y-1 pt-1 text-xs text-[#1B1812]/60">
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-[#E8A33D] shrink-0" />
                        <span className="truncate">{item.location}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-[#1B1812]/40 shrink-0" />
                        <span>{item.timeAgo}</span>
                      </div>
                    </div>

                    {/* Potential Match Notification Box with Verification Prompt */}
                    {item.status === 'matched' && (
                      <div className="p-3 rounded-lg border border-[#E8A33D]/40 bg-[#E8A33D]/10 space-y-2 text-xs">
                        <div className="flex items-center justify-between text-[#1B1812]">
                          <span className="font-medium flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-[#E8A33D]" />
                            <span>Candidate Match Found</span>
                          </span>
                          <span className="text-[10px] font-semibold text-[#1B1812]/70 uppercase tracking-wider">
                            Unverified
                          </span>
                        </div>
                        <p className="text-[11px] text-[#1B1812]/80 leading-relaxed">
                          AI identified candidate {item.type === 'found' ? 'lost report' : 'found report'}.
                          Private verification is required to confirm ownership.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Card Action Buttons (Role-aware) */}
                  <div className="pt-5 border-t border-[#1B1812]/10 mt-5 flex items-center justify-between gap-2">
                    {item.type === 'found' ? (
                      <button
                        type="button"
                        onClick={() => handleOpenVerification(item, 'claimant')}
                        className="w-full py-2 px-3 rounded-md bg-[#1B1812] text-[#F6F3EC] text-xs font-medium hover:bg-[#1B1812]/90 transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs"
                      >
                        <ShieldCheck className="w-3.5 h-3.5 text-[#E8A33D]" />
                        <span>Claim as Mine</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleOpenVerification(item, 'finder')}
                        className="w-full py-2 px-3 rounded-md border border-[#1B1812]/30 hover:border-[#1B1812] text-[#1B1812] text-xs font-medium hover:bg-[#1B1812]/5 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#E8A33D]" />
                        <span>I Found This</span>
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </main>

      {/* Report Lost / Found Modal */}
      {reportModalType && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-[#1B1812]/40 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
        >
          <div className="bg-[#F6F3EC] border border-[#1B1812]/20 rounded-xl max-w-lg w-full p-6 shadow-xl space-y-5 my-auto max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#1B1812]/10 pb-3">
              <h3 className="font-fraunces text-2xl font-[450] text-[#1B1812]">
                {reportModalType === 'lost' ? 'Report a Lost Item' : 'Report a Found Item'}
              </h3>
              <button
                type="button"
                onClick={() => setReportModalType(null)}
                className="text-[#1B1812]/40 hover:text-[#1B1812] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleReportSubmit} className="space-y-4 text-sm">
              {/* Item Photo */}
              <div>
                <label className="block text-xs font-medium text-[#1B1812] mb-1.5">
                  Item Photo
                </label>

                {reportImage ? (
                  <div className="relative border border-[#1B1812]/20 rounded-lg p-2.5 bg-[#1B1812]/[0.02] flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <img
                        src={reportImage}
                        alt="Uploaded preview"
                        className="w-14 h-14 object-cover rounded-md border border-[#1B1812]/15 shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-[#1B1812] truncate">
                          {isUploadingImage
                            ? 'Saving photo…'
                            : uploadedImageRef
                            ? 'Photo attached & saved'
                            : 'Photo attached (preview only)'}
                        </p>
                        {uploadFailed && !isUploadingImage && (
                          <p className="text-[10px] text-red-700 mt-0.5">{uploadFailed}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-[#1B1812]/70 hover:text-[#1B1812] underline cursor-pointer">
                        <span>Replace</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleImageSelect}
                        />
                      </label>
                      <span className="text-[#1B1812]/20">•</span>
                      <button
                        type="button"
                        onClick={() => {
                          setReportImage('');
                          setUploadedImageRef(null);
                          setUploadFailed(null);
                        }}
                        className="text-xs text-[#1B1812]/60 hover:text-[#1B1812] underline cursor-pointer"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleImageDrop}
                    className={`border-2 border-dashed rounded-lg p-4 text-center transition-all ${
                      isDragging
                        ? 'border-[#E8A33D] bg-[#E8A33D]/10'
                        : 'border-[#1B1812]/20 hover:border-[#1B1812]/40 bg-[#1B1812]/[0.01]'
                    }`}
                  >
                    <Upload className="w-5 h-5 text-[#E8A33D] mx-auto mb-1.5" />
                    <label className="inline-block text-xs font-medium text-[#1B1812] underline cursor-pointer hover:text-[#E8A33D] transition-colors">
                      <span>Upload item photo</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleImageSelect}
                      />
                    </label>
                  </div>
                )}
              </div>

              {/* Item Title */}
              <div>
                <label className="block text-xs font-medium text-[#1B1812] mb-1">
                  Item Title
                </label>
                <input
                  required
                  type="text"
                  value={reportTitle}
                  onChange={(e) => setReportTitle(e.target.value)}
                  placeholder="Enter item name"
                  className="w-full px-3 py-2 border border-[#1B1812]/20 rounded bg-transparent text-[#1B1812] text-xs focus:border-[#1B1812] focus:outline-hidden"
                />
              </div>

              {/* Category, Date & Time Section */}
              <ReportDateTimePicker
                value={reportTime}
                onChange={(timeStr, details) => {
                  setReportTime(timeStr);
                  setReportTimeDetails(details ?? null);
                }}
                dateLabel={reportModalType === 'lost' ? 'Date Lost' : 'Date Found'}
                timeLabel={reportModalType === 'lost' ? 'Time Lost' : 'Time Found'}
                categorySelect={
                  <div className="w-full min-w-0">
                    <label className="block text-xs font-medium text-[#1B1812] mb-1">
                      Category
                    </label>
                    <SearchableCategorySelect
                      value={reportCategory}
                      onChange={(cat) => setReportCategory(cat)}
                    />
                  </div>
                }
              />

              {/* Location */}
              <div>
                <label className="block text-xs font-medium text-[#1B1812] mb-1">
                  Location
                </label>
                <input
                  required
                  type="text"
                  value={reportLocation}
                  onChange={(e) => setReportLocation(e.target.value)}
                  placeholder={
                    reportModalType === 'lost'
                      ? 'Where did you lose it?'
                      : 'Where did you find it?'
                  }
                  className="w-full px-3 py-2 border border-[#1B1812]/20 rounded bg-transparent text-[#1B1812] text-xs focus:border-[#1B1812] focus:outline-hidden"
                />
              </div>

              {/* Item Condition (Found item form only) */}
              {reportModalType === 'found' && (
                <div>
                  <label className="block text-xs font-medium text-[#1B1812] mb-1">
                    Item Condition
                  </label>
                  <select
                    value={reportCondition}
                    onChange={(e) => setReportCondition(e.target.value)}
                    className="w-full px-3 py-2 border border-[#1B1812]/20 rounded bg-transparent text-[#1B1812] text-xs focus:border-[#1B1812] focus:outline-hidden cursor-pointer font-medium"
                  >
                    <option value="Good" className="bg-[#F6F3EC] text-[#1B1812]">Good</option>
                    <option value="Damaged" className="bg-[#F6F3EC] text-[#1B1812]">Damaged</option>
                    <option value="Like New" className="bg-[#F6F3EC] text-[#1B1812]">Like New</option>
                    <option value="Normal Wear" className="bg-[#F6F3EC] text-[#1B1812]">Normal Wear</option>
                  </select>
                </div>
              )}

              {/* Distinctive Features */}
              <div>
                <label className="block text-xs font-medium text-[#1B1812] mb-1">
                  Distinctive Features
                </label>
                <textarea
                  rows={3}
                  value={reportFeatures}
                  onChange={(e) => setReportFeatures(e.target.value)}
                  placeholder="Optional: marks, scratches, stickers, engraving, etc."
                  className="w-full px-3 py-2 border border-[#1B1812]/20 rounded bg-transparent text-[#1B1812] text-xs focus:border-[#1B1812] focus:outline-hidden"
                />
              </div>

              {/* Private Verification System */}
              <PrivateVerificationEditor
                category={reportCategory}
                questions={reportQuestions}
                onChange={setReportQuestions}
                mode={reportModalType}
                subtitle={
                  reportModalType === 'lost'
                    ? 'Add details only the owner would know.'
                    : 'Add details that can help confirm the rightful owner.'
                }
              />

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#1B1812]/10">
                <button
                  type="button"
                  onClick={() => setReportModalType(null)}
                  className="px-4 py-2 text-xs font-medium text-[#1B1812]/70 hover:text-[#1B1812] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingReport}
                  className="px-5 py-2 text-xs font-medium bg-[#1B1812] text-[#F6F3EC] rounded hover:bg-[#1B1812]/90 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isSubmittingReport ? 'Publishing…' : 'Submit Report'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Dedicated Match Verification Modal */}
      {activeVerification && (
        <MatchVerificationModal
          item={activeVerification.item}
          role={activeVerification.role}
          onClose={() => setActiveVerification(null)}
          onItemReturned={handleItemReturned}
        />
      )}

      {/* Authentication Modal (Sign In, Sign Up, Google, MFA, Password Reset) */}
      <AuthModal
        isOpen={isAuthModalOpen}
        initialMode={authModalMode}
        resetTokenProp={resetTokenParam}
        onClose={() => {
          setIsAuthModalOpen(false);
          setResetTokenParam('');
        }}
        onSuccess={() => {
          setReportSuccessMessage(
            authModalMode === 'signup'
              ? 'Account created and signed in! Welcome to FoundIt.'
              : 'Signed in successfully.'
          );
          setTimeout(() => setReportSuccessMessage(''), 4500);
        }}
      />

      {/* Success Notification */}
      {reportSuccessMessage && (
        <div className="fixed bottom-6 right-6 z-40 bg-[#1B1812] text-[#F6F3EC] px-4 py-3 rounded-lg shadow-lg border border-[#1B1812] flex items-center gap-3 text-xs animate-in fade-in slide-in-from-bottom-3 duration-200">
          <CheckCircle2 className="w-4 h-4 text-[#E8A33D] shrink-0" />
          <span>{reportSuccessMessage}</span>
        </div>
      )}

      {/* Testing Utility Drawer / Bar at Bottom */}
      <footer className="mt-auto border-t border-[#1B1812]/10 bg-[#F6F3EC] py-6 px-4">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#1B1812]/60">
          <div className="flex items-center gap-2">
            <span className="font-fraunces font-medium text-[#1B1812]">FoundIt</span>
            <span>&copy; {new Date().getFullYear()} Lost &amp; Found Matching Network</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

/**
 * Combines the picker's selected date with the chosen time mode into an ISO
 * timestamp the server accepts. Unknown time = date at noon local.
 */
function combineDateAndMode(details: DateTimeValue): string {
  const [y, m, d] = details.date.split('-').map(Number);

  if (details.timeMode === 'exact' && details.exactTime) {
    const { hour, minute, period } = details.exactTime;
    const h24 = period === 'PM' ? ((Number(hour) % 12) + 12) % 24 : Number(hour) % 12;
    return new Date(y, m - 1, d, h24, Number(minute)).toISOString();
  }

  if (details.timeMode === 'approximate' && details.approximateRange) {
    const { startHour, startMinute, startPeriod } = details.approximateRange;
    const h24 =
      startPeriod === 'PM' ? ((Number(startHour) % 12) + 12) % 24 : Number(startHour) % 12;
    return new Date(y, m - 1, d, h24, Number(startMinute)).toISOString();
  }

  return new Date(y, m - 1, d, 12, 0).toISOString();
}

export default LandingPage;
