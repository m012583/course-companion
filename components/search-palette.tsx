'use client';
import { useMemo, useState } from 'react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from './ui/command';
import type { Course } from '@/lib/workspace-types';
import type { Note } from '@/lib/knowledge';
import { searchWorkspace, type SearchHit } from '@/lib/workspace-search';
export default function SearchPalette({
  notes,
  courses,
  onClose,
  onOpen,
  onNew,
  onGraph,
}: {
  notes: Note[];
  courses: Course[];
  onClose: () => void;
  onOpen: (hit: SearchHit) => void;
  onNew: () => void;
  onGraph: () => void;
}) {
  const [query, setQuery] = useState(''),
    [kind, setKind] = useState('全部'),
    [owner, setOwner] = useState('');
  const hits = useMemo(
    () => searchWorkspace(courses, notes, query, kind, owner),
    [courses, notes, query, kind, owner],
  );
  return (
    <>
      <div className="modal-heading">
        <h2 id="quick-search-title">查找学习内容</h2>
        <button onClick={onClose} aria-label="关闭快速查找">
          关闭
        </button>
      </div>
      <div className="search-filters">
        <label>
          内容类型
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            {['全部', '课程', '笔记', '教材', '练习', '回答'].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label>
          课程范围
          <select value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="">全部课程</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <Command shouldFilter={false} loop>
        <CommandInput
          aria-label="搜索学习内容"
          placeholder="搜索教材、笔记、练习与历史回答…"
          value={query}
          onValueChange={setQuery}
        />
        <CommandList aria-label="搜索结果">
          <CommandEmpty>
            没有找到相关内容。试试较短的关键词或更换范围。
          </CommandEmpty>
          {!!hits.length && (
            <CommandGroup
              heading={`${hits.length} 个结果${hits.length > 50 ? '，显示前 50 个，请缩小范围' : ''}`}
            >
              {hits.slice(0, 50).map((hit) => (
                <CommandItem
                  key={hit.id}
                  value={hit.id}
                  onSelect={() => onOpen(hit)}
                >
                  <span className="command-result">
                    <strong>{hit.title}</strong>
                    <small>
                      {hit.courseName} · {hit.kind}
                    </small>
                    {query && <small>{hit.excerpt}</small>}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {!query && (
            <CommandGroup heading="快捷操作">
              <CommandItem value="new" onSelect={onNew}>
                新建笔记
              </CommandItem>
              <CommandItem value="graph" onSelect={onGraph}>
                打开知识图谱
              </CommandItem>
            </CommandGroup>
          )}
        </CommandList>
      </Command>
      <p className="muted small">
        ↑ ↓ 选择 · Enter 打开 · Esc 关闭。教材、练习和回答在输入关键词后检索。
      </p>
    </>
  );
}
