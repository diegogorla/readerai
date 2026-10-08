import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, Search, FileText, HardDrive, RefreshCw, 
  ExternalLink, LogIn, LogOut, CheckCircle2, AlertCircle, 
  Upload, Cloud, Sparkles, FileType
} from 'lucide-react';
import { User } from 'firebase/auth';
import { 
  signInWithGoogleDrive, 
  signOutGoogleDrive, 
  listDriveFiles, 
  loadDriveFileContent, 
  saveDocumentToDrive, 
  DriveFile, 
  getDriveAccessToken 
} from '../services/googleDrive';

interface GoogleDriveModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectFile: (content: string, filename: string) => void;
  currentDocument?: {
    filename: string;
    content: string;
  };
}

export const GoogleDriveModal: React.FC<GoogleDriveModalProps> = ({
  isOpen,
  onClose,
  onSelectFile,
  currentDocument
}) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(false);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'docs' | 'pdf' | 'text'>('all');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Save to Drive modal confirmation state
  const [isSaving, setIsSaving] = useState(false);
  const [saveFileName, setSaveFileName] = useState('');
  const [saveFormat, setSaveFormat] = useState<'html' | 'txt'>('html');
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [loadingFileId, setLoadingFileId] = useState<string | null>(null);

  const isAuthenticated = !!getDriveAccessToken();

  const handleFetchFiles = useCallback(async () => {
    if (!getDriveAccessToken()) return;
    setIsLoadingFiles(true);
    setErrorMessage(null);
    try {
      const driveFiles = await listDriveFiles(searchTerm, filterType);
      setFiles(driveFiles);
    } catch (err: any) {
      console.error('Error loading Drive files:', err);
      setErrorMessage(err.message || 'Failed to fetch files from Google Drive.');
    } finally {
      setIsLoadingFiles(false);
    }
  }, [searchTerm, filterType]);

  useEffect(() => {
    if (isOpen && isAuthenticated) {
      handleFetchFiles();
    }
  }, [isOpen, isAuthenticated, handleFetchFiles]);

  useEffect(() => {
    if (currentDocument) {
      setSaveFileName(currentDocument.filename.replace(/\.[^/.]+$/, '') || 'document');
    }
  }, [currentDocument]);

  const handleSignIn = async () => {
    setIsLoadingAuth(true);
    setErrorMessage(null);
    try {
      const res = await signInWithGoogleDrive();
      if (res) {
        setCurrentUser(res.user);
        setSuccessMessage('Successfully connected to Google Drive!');
        setTimeout(() => setSuccessMessage(null), 3500);
        handleFetchFiles();
      }
    } catch (err: any) {
      console.error('Sign in error:', err);
      setErrorMessage(err.message || 'Could not complete Google Sign-In.');
    } finally {
      setIsLoadingAuth(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOutGoogleDrive();
      setCurrentUser(null);
      setFiles([]);
      setSuccessMessage('Signed out from Google Drive.');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      console.error('Sign out error:', err);
    }
  };

  const handleOpenFile = async (file: DriveFile) => {
    setLoadingFileId(file.id);
    setErrorMessage(null);
    try {
      const { content, filename } = await loadDriveFileContent(file);
      onSelectFile(content, filename);
      onClose();
    } catch (err: any) {
      console.error('Failed to open file:', err);
      setErrorMessage(err.message || 'Failed to open file from Google Drive.');
    } finally {
      setLoadingFileId(null);
    }
  };

  const handleConfirmSave = async () => {
    if (!currentDocument || !currentDocument.content) return;
    setIsSaving(true);
    setErrorMessage(null);
    try {
      const saved = await saveDocumentToDrive(saveFileName, currentDocument.content, saveFormat);
      setShowSaveConfirm(false);
      setSuccessMessage(`"${saved.name}" successfully saved to your Google Drive!`);
      setTimeout(() => setSuccessMessage(null), 4000);
      handleFetchFiles();
    } catch (err: any) {
      console.error('Save to Drive error:', err);
      setErrorMessage(err.message || 'Failed to save document to Google Drive.');
    } finally {
      setIsSaving(false);
    }
  };

  const getFileBadge = (mimeType: string) => {
    if (mimeType.includes('document')) return { label: 'Google Doc', bg: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' };
    if (mimeType.includes('pdf')) return { label: 'PDF', bg: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' };
    if (mimeType.includes('word')) return { label: 'Word', bg: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300' };
    return { label: 'Text/HTML', bg: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' };
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            className="w-full max-w-3xl max-h-[88vh] bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl border border-zinc-200 dark:border-zinc-800 flex flex-col overflow-hidden"
          >
            {/* Modal Header */}
            <div className="p-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3 bg-zinc-50/50 dark:bg-zinc-900/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400">
                  <HardDrive size={22} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                    Google Drive
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 font-medium">
                      Cloud Storage
                    </span>
                  </h2>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Open documents directly from your Google Drive into Reader AI
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {isAuthenticated && (
                  <button
                    onClick={handleSignOut}
                    className="text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400 px-3 py-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors flex items-center gap-1.5"
                    title="Sign Out from Google Drive"
                  >
                    <LogOut size={14} />
                    <span className="hidden sm:inline">Disconnect</span>
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Notification messages */}
            {errorMessage && (
              <div className="mx-5 mt-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/40 text-red-700 dark:text-red-300 text-xs flex items-center gap-2">
                <AlertCircle size={16} className="shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {successMessage && (
              <div className="mx-5 mt-4 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2">
                <CheckCircle2 size={16} className="shrink-0" />
                <span>{successMessage}</span>
              </div>
            )}

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {!isAuthenticated ? (
                /* Unauthenticated View */
                <div className="text-center py-10 px-4 max-w-md mx-auto space-y-6">
                  <div className="w-16 h-16 rounded-3xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto shadow-inner">
                    <Cloud size={32} />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
                      Connect your Google Drive
                    </h3>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                      Sign in with Google to read your Google Docs, PDF files, and documents with natural AI voice narration.
                    </p>
                  </div>

                  <button
                    onClick={handleSignIn}
                    disabled={isLoadingAuth}
                    className="w-full inline-flex items-center justify-center gap-3 px-6 py-3.5 rounded-2xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-semibold text-sm hover:opacity-90 transition-all shadow-md active:scale-[0.99] disabled:opacity-50"
                  >
                    {isLoadingAuth ? (
                      <RefreshCw size={18} className="animate-spin" />
                    ) : (
                      <svg className="w-5 h-5" viewBox="0 0 24 24">
                        <path
                          fill="currentColor"
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                          fill="currentColor"
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                          fill="currentColor"
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                        />
                        <path
                          fill="currentColor"
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                        />
                      </svg>
                    )}
                    <span>{isLoadingAuth ? 'Signing in...' : 'Sign in with Google'}</span>
                  </button>

                  <div className="pt-2 text-xs text-zinc-400 dark:text-zinc-500">
                    With permission from your Google account. We only read files you select.
                  </div>
                </div>
              ) : (
                /* Authenticated View: Search, Filter, Files & Save */
                <div className="space-y-4">
                  {/* Top Bar: Search and Save Trigger */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                    <div className="relative flex-1">
                      <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                      <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleFetchFiles()}
                        placeholder="Search Google Drive files..."
                        className="w-full pl-9 pr-4 py-2 bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleFetchFiles}
                        disabled={isLoadingFiles}
                        className="px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 text-xs font-medium transition-colors flex items-center gap-1.5"
                        title="Refresh file list"
                      >
                        <RefreshCw size={14} className={isLoadingFiles ? 'animate-spin' : ''} />
                        <span>Refresh</span>
                      </button>

                      {currentDocument && currentDocument.content && (
                        <button
                          onClick={() => setShowSaveConfirm(true)}
                          className="px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 transition-colors flex items-center gap-1.5 shadow-sm"
                        >
                          <Upload size={14} />
                          <span>Save to Drive</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Filter chips */}
                  <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
                    {(['all', 'docs', 'pdf', 'text'] as const).map((type) => (
                      <button
                        key={type}
                        onClick={() => setFilterType(type)}
                        className={`px-3 py-1.5 rounded-lg font-medium transition-colors shrink-0 ${
                          filterType === type
                            ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                        }`}
                      >
                        {type === 'all' && 'All Documents'}
                        {type === 'docs' && 'Google Docs'}
                        {type === 'pdf' && 'PDF Files'}
                        {type === 'text' && 'Text & Word'}
                      </button>
                    ))}
                  </div>

                  {/* File List */}
                  {isLoadingFiles ? (
                    <div className="py-16 text-center text-zinc-400 dark:text-zinc-500 space-y-3">
                      <RefreshCw size={24} className="animate-spin mx-auto text-blue-500" />
                      <p className="text-sm">Fetching your Google Drive files...</p>
                    </div>
                  ) : files.length === 0 ? (
                    <div className="py-16 text-center text-zinc-400 dark:text-zinc-500 space-y-2">
                      <FileText size={32} className="mx-auto opacity-40" />
                      <p className="text-sm font-medium">No documents found</p>
                      <p className="text-xs">Try searching for other keywords or upload a new file.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-2">
                      {files.map((file) => {
                        const badge = getFileBadge(file.mimeType);
                        const isOpening = loadingFileId === file.id;

                        return (
                          <div
                            key={file.id}
                            className="p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-800/60 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-700/60 transition-all flex items-center justify-between gap-3 group"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-10 h-10 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center shrink-0 shadow-xs">
                                <FileType size={20} className="text-zinc-600 dark:text-zinc-300" />
                              </div>

                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                                    {file.name}
                                  </h4>
                                  <span className={`text-[10px] px-2 py-0.5 rounded-md font-medium shrink-0 ${badge.bg}`}>
                                    {badge.label}
                                  </span>
                                </div>
                                <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                                  {file.modifiedTime ? `Modified ${new Date(file.modifiedTime).toLocaleDateString()}` : 'Google Drive'}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              {file.webViewLink && (
                                <a
                                  href={file.webViewLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-200/60 dark:hover:bg-zinc-700 transition-colors"
                                  title="View on Google Drive"
                                >
                                  <ExternalLink size={15} />
                                </a>
                              )}

                              <button
                                onClick={() => handleOpenFile(file)}
                                disabled={isOpening}
                                className="px-3.5 py-1.5 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-xs font-semibold hover:opacity-90 transition-opacity flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                              >
                                {isOpening ? (
                                  <RefreshCw size={13} className="animate-spin" />
                                ) : (
                                  <Sparkles size={13} />
                                )}
                                <span>{isOpening ? 'Loading...' : 'Open'}</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Mandatory User Confirmation Dialog for Saving to Google Drive */}
            <AnimatePresence>
              {showSaveConfirm && (
                <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="w-full max-w-md bg-white dark:bg-zinc-900 p-6 rounded-3xl shadow-2xl border border-zinc-200 dark:border-zinc-800 space-y-4"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                        <Upload size={20} />
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                          Save to Google Drive
                        </h3>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                          Confirm creating a new document in your Google Drive
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3 pt-2">
                      <div>
                        <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                          File Name
                        </label>
                        <input
                          type="text"
                          value={saveFileName}
                          onChange={(e) => setSaveFileName(e.target.value)}
                          className="w-full px-3.5 py-2 text-sm bg-zinc-100 dark:bg-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-zinc-900 dark:text-zinc-100"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                          Format
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setSaveFormat('html')}
                            className={`py-2 px-3 rounded-xl text-xs font-medium border transition-colors ${
                              saveFormat === 'html'
                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                                : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400'
                            }`}
                          >
                            HTML Document
                          </button>
                          <button
                            type="button"
                            onClick={() => setSaveFormat('txt')}
                            className={`py-2 px-3 rounded-xl text-xs font-medium border transition-colors ${
                              saveFormat === 'txt'
                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                                : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400'
                            }`}
                          >
                            Plain Text (.txt)
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-zinc-100 dark:bg-zinc-800/80 text-[11px] text-zinc-600 dark:text-zinc-400">
                      With your permission, this action will create a new file named <strong>{saveFileName}.{saveFormat}</strong> in your Google Drive root directory.
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setShowSaveConfirm(false)}
                        disabled={isSaving}
                        className="px-4 py-2 rounded-xl text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleConfirmSave}
                        disabled={isSaving || !saveFileName.trim()}
                        className="px-5 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors flex items-center gap-1.5 disabled:opacity-50 shadow-sm"
                      >
                        {isSaving && <RefreshCw size={13} className="animate-spin" />}
                        <span>{isSaving ? 'Saving...' : 'Confirm & Save'}</span>
                      </button>
                    </div>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
