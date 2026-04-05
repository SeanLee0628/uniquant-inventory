import React, { useState, useRef, useEffect } from 'react';
import { sendChat } from '../api/client';

const EXAMPLE_QUESTIONS = [
  "MICRON DDR4 지금 몇 개 남았어?",
  "datecode 2년 넘은 거 금액으로 얼마야?",
  "지난달 대비 재고 늘었어 줄었어?",
  "이번 달 출고 제일 많은 고객이 누구야?",
  "가용재고가 MOQ 이하인 품목 알려줘",
  "벤더별 재고 금액 비교해줘",
];

export default function Chat() {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: '안녕하세요! 창고 재고관리 AI 비서입니다.\n재고, 출고, 노후도 등 무엇이든 물어보세요.',
      queries: [],
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showQueries, setShowQueries] = useState({});
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSend = async (text) => {
    const msg = (text || input).trim();
    if (!msg || loading) return;
    setInput('');

    const userMsg = { role: 'user', content: msg, queries: [] };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    const history = messages
      .filter((_, i) => i > 0)
      .map(m => ({ role: m.role, content: m.content }));

    try {
      const res = await sendChat(msg, history);
      const assistantMsg = {
        role: 'assistant',
        content: res.data.answer,
        queries: res.data.queries_executed || [],
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err) {
      const errMsg = err.response?.data?.detail || '오류가 발생했습니다. 다시 시도해주세요.';
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: '오류: ' + errMsg, queries: [] },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const toggleQueries = (idx) => {
    setShowQueries(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  return (
    <div>
      <h1 className="page-title">🤖 AI 재고 비서</h1>

      <div className="chat-container">
        <div className="chat-messages">
          {messages.map((msg, i) => (
            <div key={i} className={'chat-msg ' + msg.role}>
              <div className="chat-avatar">
                {msg.role === 'user' ? '👤' : '🤖'}
              </div>
              <div className="chat-bubble">
                <div className="chat-text" style={{ whiteSpace: 'pre-wrap' }}>
                  {msg.content}
                </div>
                {msg.queries && msg.queries.length > 0 && (
                  <div className="chat-queries">
                    <button
                      className="query-toggle"
                      onClick={() => toggleQueries(i)}
                    >
                      {showQueries[i] ? '▼' : '▶'} SQL {msg.queries.length}개 실행됨
                    </button>
                    {showQueries[i] && (
                      <div className="query-list">
                        {msg.queries.map((q, j) => (
                          <div key={j} className="query-item">
                            {q.description && (
                              <div className="query-desc">{q.description}</div>
                            )}
                            <code>{q.sql}</code>
                            <span className="query-rows">{q.row_count}행 반환</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="chat-msg assistant">
              <div className="chat-avatar">🤖</div>
              <div className="chat-bubble">
                <div className="chat-typing">
                  <span></span><span></span><span></span>
                  DB 조회 중...
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {messages.length <= 1 && (
          <div className="chat-examples">
            <p>이런 것들을 물어보세요:</p>
            <div className="example-grid">
              {EXAMPLE_QUESTIONS.map((q, i) => (
                <button key={i} className="example-btn" onClick={() => handleSend(q)}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="chat-input-area">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="재고에 대해 무엇이든 물어보세요... (Enter로 전송)"
            rows={1}
            disabled={loading}
          />
          <button
            className="btn btn-primary chat-send"
            onClick={() => handleSend()}
            disabled={loading || !input.trim()}
          >
            {loading ? '...' : '➤'}
          </button>
        </div>
      </div>
    </div>
  );
}
