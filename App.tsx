
import React, { useState, useCallback, useRef } from 'react';
import { 
  BookOpen, 
  Send, 
  CheckCircle2, 
  Search, 
  BrainCircuit, 
  ClipboardCheck, 
  Plus, 
  Trash2, 
  FileText,
  Loader2,
  HelpCircle,
  AlertCircle,
  Upload,
  FileUp,
  X,
  Image as ImageIcon,
  Camera
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';

// PDF.js worker setup
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://esm.sh/pdfjs-dist@4.10.38/build/pdf.worker.mjs';

import { GCSEMultiAgentSystem } from './geminiService';
import { AgentRole, AgentStatus, TextbookContent, Solution, ImageData } from './types';

const agentSystem = new GCSEMultiAgentSystem();

const App: React.FC = () => {
  const [textbookContext, setTextbookContext] = useState<TextbookContent[]>([]);
  const [problem, setProblem] = useState('');
  const [problemImages, setProblemImages] = useState<ImageData[]>([]);
  const [isSolving, setIsSolving] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionProgress, setExtractionProgress] = useState(0);
  const [solution, setSolution] = useState<Solution | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  
  const [librarianStatus, setLibrarianStatus] = useState<AgentStatus>({ role: 'Librarian', status: 'idle', message: 'Ready to research...' });
  const [solverStatus, setSolverStatus] = useState<AgentStatus>({ role: 'Solver', status: 'idle', message: 'Waiting for research memo...' });
  const [examinerStatus, setExaminerStatus] = useState<AgentStatus>({ role: 'Examiner', status: 'idle', message: 'Ready to review...' });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf') {
      setError("Please upload a PDF file.");
      return;
    }

    setIsExtracting(true);
    setExtractionProgress(0);
    setError(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      
      let fullText = '';
      const numPages = pdf.numPages;

      for (let i = 1; i <= numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join(' ');
        fullText += `[Page ${i}]\n${pageText}\n\n`;
        setExtractionProgress(Math.round((i / numPages) * 100));
      }

      setTextbookContext(prev => [...prev, { text: fullText, sourceName: `${file.name} (${numPages} pgs)` }]);
    } catch (err: any) {
      setError("Failed to process PDF: " + err.message);
    } finally {
      setIsExtracting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newImages: ImageData[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const reader = new FileReader();
      const promise = new Promise<ImageData>((resolve) => {
        reader.onloadend = () => {
          resolve({
            base64: reader.result as string,
            mimeType: file.type
          });
        };
      });
      reader.readAsDataURL(file);
      newImages.push(await promise);
    }
    setProblemImages([...problemImages, ...newImages]);
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  const removeImage = (index: number) => {
    setProblemImages(problemImages.filter((_, i) => i !== index));
  };

  const handleSolve = async () => {
    if (!problem.trim() && problemImages.length === 0) {
      setError("Please enter a question or upload an image of the problem.");
      return;
    }
    if (textbookContext.length === 0) {
      setError("Please provide textbook material first.");
      return;
    }

    setError(null);
    setIsSolving(true);
    setSolution(null);

    try {
      setLibrarianStatus({ role: 'Librarian', status: 'working', message: 'Extracting knowledge points from textbook...' });
      setSolverStatus({ role: 'Solver', status: 'idle', message: 'Waiting for Librarian...' });
      setExaminerStatus({ role: 'Examiner', status: 'idle', message: 'Awaiting logic...' });

      const result = await agentSystem.solve(problem, textbookContext, problemImages);
      
      setLibrarianStatus({ role: 'Librarian', status: 'completed', message: 'Relevant material found and categorized.' });
      setSolverStatus({ role: 'Solver', status: 'completed', message: 'Applied formulas to solve the problem.' });
      setExaminerStatus({ role: 'Examiner', status: 'completed', message: 'Verified against curriculum standards.' });
      
      setSolution(result);
    } catch (err: any) {
      setError("Error: " + err.message);
      setLibrarianStatus(p => ({ ...p, status: 'error' }));
      setSolverStatus(p => ({ ...p, status: 'error' }));
      setExaminerStatus(p => ({ ...p, status: 'error' }));
    } finally {
      setIsSolving(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-50">
      {/* Sidebar: Knowledge Base */}
      <aside className="w-full md:w-1/3 lg:w-1/4 bg-white border-r border-slate-200 p-6 overflow-y-auto max-h-screen sticky top-0 flex flex-col">
        <div className="flex items-center gap-2 mb-6">
          <BookOpen className="text-blue-600" />
          <h2 className="text-xl font-bold text-slate-800">Knowledge Base</h2>
        </div>
        
        <div 
          onClick={() => fileInputRef.current?.click()}
          className={`mb-6 p-6 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center gap-3 cursor-pointer transition-all ${
            isExtracting ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-blue-400 hover:bg-slate-50'
          }`}
        >
          <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="application/pdf" className="hidden" />
          {isExtracting ? (
            <div className="text-center">
              <Loader2 className="animate-spin text-blue-500 mx-auto mb-2" size={32} />
              <p className="text-xs font-bold text-blue-700">Extracting PDF: {extractionProgress}%</p>
            </div>
          ) : (
            <>
              <FileUp className="text-slate-400" size={32} />
              <p className="text-sm font-medium text-slate-700">Upload PDF Textbook</p>
            </>
          )}
        </div>

        <div className="flex-1 space-y-3">
          {textbookContext.map((ctx, idx) => (
            <div key={idx} className="p-3 border border-slate-100 rounded-xl bg-slate-50 relative group">
              <button 
                onClick={() => setTextbookContext(textbookContext.filter((_, i) => i !== idx))}
                className="absolute top-2 right-2 p-1 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X size={14} />
              </button>
              <p className="text-xs font-bold text-slate-700 truncate pr-6">{ctx.sourceName}</p>
              <p className="text-[10px] text-slate-400 mt-1">{ctx.text.length.toLocaleString()} characters</p>
            </div>
          ))}
        </div>
      </aside>

      {/* Main Panel */}
      <main className="flex-1 p-6 md:p-10 max-h-screen overflow-y-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">GCSE Scholar Agent</h1>
          <p className="text-slate-600 mt-2">A multi-agent system that researches your textbook before solving problems.</p>
        </header>

        {/* Multimodal Input Section */}
        <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 mb-8">
          <div className="flex items-center gap-2 mb-4">
            <HelpCircle className="text-blue-500" size={20} />
            <h3 className="font-semibold text-slate-800">Your Problem</h3>
          </div>
          
          <div className="relative">
            <textarea
              value={problem}
              onChange={(e) => setProblem(e.target.value)}
              placeholder="Describe the problem or refer to attached diagrams..."
              className="w-full h-32 p-4 text-lg border border-slate-200 rounded-xl bg-slate-50 focus:ring-4 focus:ring-blue-50 outline-none transition-all"
            />
            
            {/* Image Preview Strip */}
            {problemImages.length > 0 && (
              <div className="flex gap-3 overflow-x-auto p-2 mt-2 bg-slate-50 rounded-lg border border-slate-100">
                {problemImages.map((img, idx) => (
                  <div key={idx} className="relative group flex-shrink-0">
                    <img src={img.base64} alt="Problem attachment" className="h-20 w-20 object-cover rounded-lg border border-white shadow-sm" />
                    <button 
                      onClick={() => removeImage(idx)}
                      className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-1 shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <input 
                type="file" 
                ref={imageInputRef} 
                onChange={handleImageUpload} 
                accept="image/*" 
                multiple 
                className="hidden" 
              />
              <button 
                onClick={() => imageInputRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors border border-slate-200"
              >
                <ImageIcon size={18} />
                Add Diagram/Photo
              </button>
              
              <div className="flex-1 min-w-[200px]">
                {error && <p className="text-red-500 text-xs animate-pulse font-medium">{error}</p>}
              </div>

              <button
                onClick={handleSolve}
                disabled={isSolving || isExtracting}
                className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-blue-700 disabled:opacity-50 transition-all shadow-lg shadow-blue-200"
              >
                {isSolving ? <Loader2 className="animate-spin" size={20} /> : <Send size={20} />}
                {isSolving ? 'Agents working...' : 'Start Solver Workflow'}
              </button>
            </div>
          </div>
        </section>

        {/* Agent Dashboard */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <AgentCard status={librarianStatus} icon={<Search size={20} />} />
          <AgentCard status={solverStatus} icon={<BrainCircuit size={20} />} />
          <AgentCard status={examinerStatus} icon={<ClipboardCheck size={20} />} />
        </div>

        {/* Solution */}
        {solution && (
          <div className="space-y-6">
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
              <h2 className="text-2xl font-bold text-slate-800 mb-8 flex items-center gap-2">
                <CheckCircle2 className="text-green-500" />
                Multi-Agent Output
              </h2>
              <div className="space-y-8">
                {solution.steps.map((step, idx) => (
                  <div key={idx} className="relative pl-8 border-l-2 border-slate-100 pb-8 last:pb-0">
                    <div className={`absolute -left-[9px] top-0 w-4 h-4 rounded-full border-2 border-white shadow-sm ${
                      step.agent === 'Librarian' ? 'bg-amber-500' : 'bg-blue-500'
                    }`} />
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${step.agent === 'Librarian' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                        {step.agent}
                      </span>
                      <h4 className="font-bold text-slate-800 uppercase tracking-tight text-sm">{step.title}</h4>
                    </div>
                    <div className={`whitespace-pre-wrap p-5 rounded-xl border ${
                      step.agent === 'Librarian' 
                        ? 'bg-amber-50/50 border-amber-100 text-amber-900 font-medium italic' 
                        : 'bg-slate-50 border-slate-100 text-slate-700'
                    }`}>
                      {step.content}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-indigo-600 p-8 rounded-3xl text-white shadow-2xl shadow-indigo-200 border-4 border-white">
              <div className="flex items-center gap-2 mb-4 text-indigo-100">
                <FileText size={24} />
                <h3 className="text-xl font-bold uppercase tracking-widest text-sm">Examiner's Final Verdict</h3>
              </div>
              <p className="text-indigo-50 italic text-lg leading-relaxed border-l-4 border-indigo-400 pl-6 py-2">
                "{solution.curriculumCheck}"
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

const AgentCard: React.FC<{ status: AgentStatus, icon: React.ReactNode }> = ({ status, icon }) => {
  const isWorking = status.status === 'working';
  const isCompleted = status.status === 'completed';
  const isError = status.status === 'error';

  return (
    <div className={`p-5 rounded-2xl border transition-all duration-500 ${isWorking ? 'bg-blue-50 border-blue-200 ring-4 ring-blue-50 scale-105' : 'bg-white border-slate-200'}`}>
      <div className="flex items-center gap-3 mb-3">
        <div className={`p-2.5 rounded-xl ${isWorking ? 'bg-blue-600 text-white animate-pulse' : isCompleted ? 'bg-green-600 text-white' : isError ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
          {isWorking ? <Loader2 className="animate-spin" size={20} /> : icon}
        </div>
        <div>
          <h4 className="font-bold text-sm text-slate-800">{status.role} Agent</h4>
          <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">{status.status}</span>
        </div>
      </div>
      <p className="text-[11px] text-slate-500 line-clamp-2 leading-tight">{status.message}</p>
    </div>
  );
};

export default App;
