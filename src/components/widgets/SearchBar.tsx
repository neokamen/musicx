import React, { useState } from 'react';
import { Search } from 'lucide-react';

interface SearchBarProps {
  onSearch: (query: string) => void;
}

export default function SearchBar({ onSearch }: SearchBarProps) {
  const [query, setQuery] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(query);
  };

  return (
    <form 
      onSubmit={handleSubmit} 
      className='flex items-center gap-2 p-2 rounded-lg bg-slate-800 border border-slate-700'
    >
      <Search className='w-4 h-4 text-slate-400' />
      <input
        type='text'
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder='Buscar música en Steam Music'
        className='flex-1 bg-transparent text-sm text-white placeholder-slate-500 outline-none'
      />
      <button
        type='submit'
        className='px-3 py-1 text-sm font-medium rounded-lg text-white bg-cyan-600 hover:bg-cyan-500 transition-colors'
      >
        Buscar
      </button>
    </form>
  );
}
