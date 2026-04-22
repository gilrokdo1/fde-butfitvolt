import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '../../api/client';
import s from './ManualChat.module.css';

interface Message {
  role: 'user' | 'assistant';
  text: string;
}

interface Manual {
  id: string;
  title: string;
  category1: string;
  category2: string;
}

export default function ManualChat() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', text: '안녕하세요! 버핏서울 지점 경영 매뉴얼 챗봇입니다.\n궁금한 업무 내용을 질문해주세요.' }
  ]);
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: manualsData, refetch: refetchManuals } = useQuery({
    queryKey: ['manual-list'],
    queryFn: () => api.get<{ manuals: Manual[] }>('/fde-api/manual/manuals').then(r => r.data),
  });

  const syncMutation = useMutation({
    mutationFn: () => api.post<{ count: number }>('/fde-api/manual/sync').then(r => r.data),
    onSuccess: (data) => {
      refetchManuals();
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: `매뉴얼 동기화 완료! 총 ${data.count}개 문서를 불러왔습니다.`
      }]);
    },
  });

  const chatMutation = useMutation({
    mutationFn: (message: string) =>
      api.post<{ reply: string }>('/fde-api/manual/chat', { message }).then(r => r.data),
    onSuccess: (data) => {
      setMessages(prev => [...prev, { role: 'assistant', text: data.reply }]);
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function handleSend() {
    const text = input.trim();
    if (!text || chatMutation.isPending) return;
    setMessages(prev => [...prev, { role: 'user', text }]);
    setInput('');
    chatMutation.mutate(text);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const manualCount = manualsData?.manuals.length ?? 0;
  const categories = [...new Set(manualsData?.manuals.map(m => m.category1) ?? [])];

  return (
    <div className={s.container}>
      <div className={s.header}>
        <div className={s.titleGroup}>
          <h1>경영 매뉴얼 챗봇</h1>
          <p>버핏서울 지점 경영 표준 매뉴얼 기반 AI 답변</p>
        </div>
        <div className={s.headerRight}>
          {manualCount > 0 ? (
            <span className={s.syncBadge}>매뉴얼 {manualCount}개 로드됨</span>
          ) : (
            <span className={s.syncBadgeEmpty}>매뉴얼 미동기화</span>
          )}
          <button
            className={s.syncBtn}
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
          >
            {syncMutation.isPending ? '동기화 중…' : '노션 동기화'}
          </button>
        </div>
      </div>

      {manualCount > 0 && (
        <div className={s.categoryBar}>
          {categories.map(c => (
            <span key={c} className={s.categoryTag}>{c}</span>
          ))}
        </div>
      )}

      <div className={s.chatWrap}>
        {messages.map((m, i) => (
          <div key={i} className={`${s.bubble} ${m.role === 'user' ? s.userBubble : s.aiBubble}`}>
            {m.role === 'assistant' && <span className={s.aiLabel}>AI</span>}
            <p className={s.bubbleText}>{m.text}</p>
          </div>
        ))}
        {chatMutation.isPending && (
          <div className={`${s.bubble} ${s.aiBubble}`}>
            <span className={s.aiLabel}>AI</span>
            <p className={s.bubbleText}>답변 생성 중…</p>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className={s.inputWrap}>
        <textarea
          className={s.input}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="질문을 입력하세요 (Enter로 전송)"
          rows={2}
          disabled={chatMutation.isPending}
        />
        <button
          className={s.sendBtn}
          onClick={handleSend}
          disabled={!input.trim() || chatMutation.isPending}
        >
          전송
        </button>
      </div>
    </div>
  );
}
