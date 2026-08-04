import React, { useState } from 'react';
import { Download, AlertTriangle, FileText, Check, Copy, Printer } from 'lucide-react';

interface DocumentDraft {
  id: string;
  type: string;
  body: string;
  is_editable?: boolean;
}

interface DocumentDraftAnswerProps {
  draft: DocumentDraft;
}

export const DocumentDraftAnswer: React.FC<DocumentDraftAnswerProps> = ({ draft }) => {
  const [editedBody, setEditedBody] = useState(draft.body);
  const [downloaded, setDownloaded] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleDownload = () => {
    if (!editedBody.trim()) return;

    const blob = new Blob([editedBody], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `LegalNotice_CPA2019_${Date.now()}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setDownloaded(true);
    setTimeout(() => setDownloaded(false), 3000);
  };

  const handleCopy = () => {
    if (!editedBody.trim()) return;
    navigator.clipboard.writeText(editedBody);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Statutory Legal Notice — CPA 2019</title>
          <style>
            body { font-family: 'Times New Roman', serif; margin: 40px; line-height: 1.6; color: #111; font-size: 14pt; }
            pre { font-family: inherit; white-space: pre-wrap; word-wrap: break-word; }
            .header { text-align: center; font-weight: bold; font-size: 16pt; margin-bottom: 30px; text-decoration: underline; }
            .footer { margin-top: 40px; font-size: 10pt; color: #666; border-top: 1px solid #ccc; padding-top: 10px; }
          </style>
        </head>
        <body>
          <div class="header">STATUTORY LEGAL NOTICE</div>
          <pre>${editedBody}</pre>
          <div class="footer">Drafted using LegalBot CPA 2019 Assistant — Review and sign before sending via Registered Post A.D.</div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  return (
    <div className="space-y-3 bg-white rounded-xl border border-neutral-300 overflow-hidden shadow-2xs border-t-4 border-t-[#A66A00]">
      {/* Review Warning Header */}
      <div className="bg-[#FBF1DE] px-4 py-2.5 border-b border-[#A66A00]/20 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-bold text-[#A66A00]">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="uppercase tracking-wider">Draft — Review before use, not legally filed</span>
        </div>
        <span className="text-[11px] font-medium text-[#A66A00]/80 hidden sm:inline">
          {draft.type === 'notice' ? 'Statutory Legal Notice' : 'Draft Petition'}
        </span>
      </div>

      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <label htmlFor={`draft-textarea-${draft.id}`} className="text-xs font-bold uppercase tracking-wider text-neutral-600 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-[#1E3A5F]" />
            Edit Legal Notice Body
          </label>
          <span className="text-xs text-neutral-400">Replace [brackets] with your actual invoice & seller details</span>
        </div>

        {/* Editable Monospace Textarea */}
        <textarea
          id={`draft-textarea-${draft.id}`}
          value={editedBody}
          onChange={(e) => setEditedBody(e.target.value)}
          rows={14}
          className="w-full p-3 font-mono text-xs sm:text-sm text-neutral-900 bg-neutral-50 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-[#1E3A5F] focus:border-[#1E3A5F] focus:bg-white transition-colors leading-relaxed resize-y"
          aria-label="Editable legal notice text"
        />

        {/* Actions bar */}
        <div className="flex items-center justify-between pt-1 flex-wrap gap-2">
          <p className="text-xs text-neutral-500">
            Serve via Registered Post A.D. or Email to seller (15-day notice period).
          </p>

          <div className="flex items-center gap-2">
            {/* Copy Button */}
            <button
              onClick={handleCopy}
              disabled={!editedBody.trim()}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-neutral-100 text-neutral-800 hover:bg-neutral-200 rounded-lg text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-[#1E3A5F] cursor-pointer"
              title="Copy notice text"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-700">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-neutral-600" />
                  <span>Copy</span>
                </>
              )}
            </button>

            {/* Print Button */}
            <button
              onClick={handlePrint}
              disabled={!editedBody.trim()}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-neutral-100 text-neutral-800 hover:bg-neutral-200 rounded-lg text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-[#1E3A5F] cursor-pointer"
              title="Print legal notice"
            >
              <Printer className="w-3.5 h-3.5 text-neutral-600" />
              <span>Print</span>
            </button>

            {/* Download Button */}
            <button
              onClick={handleDownload}
              disabled={!editedBody.trim()}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[#1E3A5F] text-white rounded-lg text-xs font-semibold hover:bg-[#16293F] transition-colors focus:outline-none focus:ring-2 focus:ring-[#1E3A5F] disabled:opacity-50 cursor-pointer"
            >
              {downloaded ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Downloaded!</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  <span>Download (.txt)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
