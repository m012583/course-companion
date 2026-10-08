'use client';
import { useMemo, useState } from 'react';
import {
  BookOpen,
  Clock3,
  FileText,
  Network,
  Plus,
  Search,
  Star,
  X,
} from 'lucide-react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { searchKnowledge } from '@/lib/note-navigation';
import type { Note } from '@/lib/knowledge';

export default function QuickSearch({
  notes,
  courses,
  onNote,
  onCourse,
  onNew,
  onGraph,
  onClose,
}: {
  notes: Note[];
  courses: { id: string; name: string }[];
  onNote: (note: Note) => void;
  onCourse: (id: string) => void;
  onNew: () => void;
  onGraph: () => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const matches = useMemo(() => searchKnowledge(notes, query), [notes, query]);
  const courseMatches = courses.filter((c) =>
    c.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );
  return (
    <>
      <div className="modal-heading quick-search-heading">
        <h2 id="quick-search-title">
          <Search size={18} />
          快速查找
        </h2>
        <button
          className="icon-button"
          aria-label="关闭快速查找"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>
      <Command shouldFilter={false} className="knowledge-command" loop>
        <CommandInput
          aria-label="搜索课程和笔记"
          placeholder="搜索笔记、正文、课程或标签…"
          value={query}
          onValueChange={setQuery}
        />
        <CommandList aria-label="搜索结果">
          <CommandEmpty>没有找到相关内容，试试标题里的其他词。</CommandEmpty>
          {!!matches.length && (
            <CommandGroup
              heading={
                query.trim()
                  ? `笔记 · ${matches.length} 个结果${matches.length > 20 ? '，显示前 20 个' : ''}`
                  : '最近查看与更新'
              }
            >
              {matches.slice(0, query.trim() ? 20 : 6).map((note) => (
                <CommandItem
                  key={note.id}
                  value={`note:${note.id}`}
                  onSelect={() => onNote(note)}
                >
                  {note.starred ? (
                    <Star size={18} />
                  ) : query.trim() ? (
                    <FileText size={18} />
                  ) : (
                    <Clock3 size={18} />
                  )}
                  <span className="command-result">
                    <strong>{note.title}</strong>
                    <small>
                      {note.course} · {note.chapter || '未分类'}
                      {query.trim()
                        ? ` · ${note.text.replace(/[#*`\n]/g, ' ').slice(0, 65)}`
                        : ''}
                    </small>
                  </span>
                  <span className="command-result-type">笔记</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {!!courseMatches.length && (
            <CommandGroup heading="课程">
              {courseMatches.slice(0, 8).map((course) => (
                <CommandItem
                  key={course.id}
                  value={`course:${course.id}`}
                  onSelect={() => onCourse(course.id)}
                >
                  <BookOpen size={18} />
                  <span>{course.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {!query.trim() && (
            <CommandGroup heading="快捷操作">
              <CommandItem value="new-note" onSelect={onNew}>
                <Plus size={18} />
                新建笔记
              </CommandItem>
              <CommandItem value="graph" onSelect={onGraph}>
                <Network size={18} />
                打开知识图谱
              </CommandItem>
            </CommandGroup>
          )}
        </CommandList>
      </Command>
      <div className="command-help">
        <span>
          <kbd>↑</kbd>
          <kbd>↓</kbd> 选择
        </span>
        <span>
          <kbd>Enter</kbd> 打开
        </span>
        <span>
          <kbd>Esc</kbd> 关闭
        </span>
      </div>
    </>
  );
}
