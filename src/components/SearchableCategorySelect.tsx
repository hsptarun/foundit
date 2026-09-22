import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search, Check } from 'lucide-react';
import { ITEM_CATEGORIES, ItemCategory } from '../data/categories';

interface SearchableCategorySelectProps {
  value: string;
  onChange: (category: ItemCategory) => void;
  id?: string;
  required?: boolean;
}

export const SearchableCategorySelect: React.FC<SearchableCategorySelectProps> = ({
  value,
  onChange,
  id = 'category-select',
  required = true,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auto-focus search input when opening
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    } else {
      setSearch('');
    }
  }, [isOpen]);

  const filteredCategories = ITEM_CATEGORIES.filter((cat) =>
    cat.toLowerCase().includes(search.toLowerCase().trim())
  );

  const selectedLabel = value || 'Select a category';

  return (
    <div ref={containerRef} className="relative w-full text-xs">
      {/* Dropdown Trigger Button */}
      <button
        type="button"
        id={id}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 border border-[#1B1812]/20 rounded bg-transparent text-[#1B1812] text-xs focus:border-[#1B1812] focus:outline-hidden flex items-center justify-between gap-2 text-left cursor-pointer transition-colors hover:border-[#1B1812]/40"
      >
        <span className={value ? 'text-[#1B1812] font-medium truncate' : 'text-[#1B1812]/50'}>
          {selectedLabel}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-[#1B1812]/50 shrink-0 transition-transform duration-150 ${
            isOpen ? 'rotate-180 text-[#1B1812]' : ''
          }`}
        />
      </button>

      {/* Hidden input to satisfy standard form submission if needed */}
      <input type="hidden" name="category" value={value} required={required} />

      {/* Searchable Dropdown Popup */}
      {isOpen && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-[#F6F3EC] border border-[#1B1812]/20 rounded-lg shadow-lg overflow-hidden py-1 max-h-64 flex flex-col">
          {/* Search Input Box */}
          <div className="p-2 border-b border-[#1B1812]/10 bg-[#1B1812]/[0.02]">
            <div className="flex items-center gap-1.5 px-2 py-1.5 rounded border border-[#1B1812]/15 bg-[#F6F3EC]">
              <Search className="w-3.5 h-3.5 text-[#1B1812]/40 shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search categories..."
                className="w-full bg-transparent text-xs text-[#1B1812] placeholder:text-[#1B1812]/40 focus:outline-hidden"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="text-[10px] text-[#1B1812]/50 hover:text-[#1B1812]"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* List of categories */}
          <div role="listbox" className="overflow-y-auto flex-1 py-1">
            {filteredCategories.length > 0 ? (
              filteredCategories.map((cat) => {
                const isSelected = value === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      onChange(cat);
                      setIsOpen(false);
                    }}
                    className={`w-full px-3 py-1.5 text-left text-xs flex items-center justify-between cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-[#1B1812] text-[#F6F3EC] font-medium'
                        : 'text-[#1B1812] hover:bg-[#1B1812]/5'
                    }`}
                  >
                    <span>{cat}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-[#E8A33D]" />}
                  </button>
                );
              })
            ) : (
              <div className="p-3 text-center text-xs text-[#1B1812]/60">
                No matching category.{' '}
                <button
                  type="button"
                  onClick={() => {
                    onChange('Other');
                    setIsOpen(false);
                  }}
                  className="text-[#1B1812] font-semibold underline cursor-pointer"
                >
                  Select &ldquo;Other&rdquo;
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
