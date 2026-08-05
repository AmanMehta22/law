import React, { useState } from 'react';
import {
  Scale,
  Plus,
  Search,
  MessageCircle,
  X,
  PanelLeftOpen,
} from 'lucide-react';

interface SidePanelProps {
  user?: { email: string } | null;
}

const mockChats = [
  {
    id: 'c1',
    title: 'Refund for defective LED TV',
    preview:
      'I bought a 55-inch LED TV that stopped working after a week. The seller refused to refund it. LegalBot helped me draft a notice under Section 39(1) asking for a ₹45,000 refund plus compensation.',
  },
  {
    id: 'c2',
    title: "Seller won't refund — legal notice",
    preview:
      'Ordered a phone online, charged ₹28,000, never received delivery. I asked for the steps to file a complaint on e-Daakhil and got the document checklist for the District Commission.',
  },
  {
    id: 'c3',
    title: 'Product arrived damaged',
    preview:
      'The laptop arrived with a cracked screen. The seller offered a 10% discount instead of a replacement. I asked about my right to a full refund and the 2-year filing deadline.',
  },
  {
    id: 'c4',
    title: 'How long do I have to file?',
    preview:
      'Wanted to know the limitation period under CPA 2019. LegalBot explained I have exactly two years from the date the cause of action arose, with condonation of delay possible for genuine reasons.',
  },
];

export const SidePanel: React.FC<SidePanelProps> = ({ user }) => {
  const [isMinimized, setIsMinimized] = useState(false);
  const [query, setQuery] = useState('');
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [chats, setChats] = useState(mockChats);

  const filteredChats = chats.filter((c) => {
    const q = query.toLowerCase();
    return (
      c.title.toLowerCase().includes(q) || c.preview.toLowerCase().includes(q)
    );
  });

  if (isMinimized) {
    return (
      <div className="h-screen sticky top-0 flex items-start pt-4 px-2">
        <button
          onClick={() => setIsMinimized(false)}
          className="p-2 rounded-lg text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 transition-colors cursor-pointer"
          title="Open sidebar"
          aria-label="Open sidebar"
        >
          <PanelLeftOpen className="w-5 h-5" />
        </button>
      </div>
    );
  }

  return (
    <aside className="w-64 h-screen sticky top-0 bg-white text-neutral-900 border-r border-neutral-200 flex flex-col transition-all duration-300">
      {/* Header */}
      <div className="flex items-center justify-between px-3 pt-3 pb-1">
  
        <button
          onClick={() => setIsMinimized(true)}
          className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 transition-colors cursor-pointer"
          title="Close sidebar"
          aria-label="Close sidebar"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* New Chat */}
      <div className="px-3 pt-2">
        <button className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-white border border-neutral-300 shadow-2xs text-sm font-medium text-neutral-900 hover:bg-neutral-50 transition-colors cursor-pointer">
          <Plus className="w-4 h-4" />
          New chat
        </button>
      </div>

      {/* Search */}
      <div className="px-3 pt-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400 pointer-events-none" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats"
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-neutral-50 border border-neutral-200 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-[#1E3A5F] transition-colors"
          />
        </div>
      </div>

      {/* Recent chats */}
      <div className="flex-1 overflow-y-auto px-3 pt-3 pb-2 space-y-0.5">
        <p className="px-2 text-[11px] font-medium uppercase tracking-wider text-neutral-500 mb-1">
          Recent
        </p>
        {filteredChats.length === 0 ? (
          <p className="px-2 py-3 text-xs text-neutral-500">No chats found.</p>
        ) : (
          filteredChats.map((chat) => (
            <div
              key={chat.id}
              onClick={() => setActiveChatId(chat.id)}
              className={`flex items-start gap-2.5 px-2 py-2 rounded-lg text-sm cursor-pointer transition-colors ${
                activeChatId === chat.id
                  ? 'bg-[#EAF1F8] text-[#1E3A5F] font-medium'
                  : 'text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900'
              }`}
            >
              <MessageCircle className="w-4 h-4 shrink-0 text-neutral-400 mt-0.5" />
              <div className="flex-1 min-w-0 space-y-0.5">
                <p className="truncate">{chat.title}</p>
                <p className="text-xs text-neutral-500 truncate">{chat.preview}</p>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-neutral-200 p-2.5 space-y-2">
        <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-neutral-100 transition-colors">
          <div className="w-7 h-7 rounded-full bg-[#1E3A5F] text-white flex items-center justify-center text-xs font-bold shrink-0">
            {(user?.email || 'G').charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-neutral-900 font-medium truncate">
              {user?.email?.split('@')[0] || 'Guest'}
            </p>
            <p className="text-xs text-neutral-500 truncate">{user?.email || 'Not signed in'}</p>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default SidePanel;