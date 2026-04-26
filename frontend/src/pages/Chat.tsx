import { useState, useEffect, useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { Send, User, MessageSquare } from 'lucide-react';

const Chat = () => {
  const { socket, status } = useAppContext();
  const [chats, setChats] = useState<any[]>([]);
  const [activeChat, setActiveChat] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loadingChats, setLoadingChats] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchChats();
  }, []);

  useEffect(() => {
    if (activeChat) {
      fetchHistory(activeChat.jid);
    }
  }, [activeChat]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const activeChatRef = useRef<any>(null);
  const chatsRef = useRef<any[]>([]);

  useEffect(() => {
    activeChatRef.current = activeChat;
  }, [activeChat]);

  useEffect(() => {
    chatsRef.current = chats;
  }, [chats]);

  useEffect(() => {
    if (!socket) return;

    const onMessage = (data: any) => {
      const { jid, message } = data;
      // Update chat list last message
      setChats(prev => prev.map(c =>
        c.jid === jid ? { ...c, lastMessage: message } : c
      ));

      const active = activeChatRef.current;
      // If new message is for active chat, append to messages
      if (active && active.jid === jid) {
        setMessages(prev => {
          // Prevent duplicates
          if (prev.some(m => m.key?.id === message.key?.id)) return prev;
          return [...prev, message];
        });
      } else if (!chatsRef.current.some(c => c.jid === jid)) {
        // New chat we don't have yet
        fetchChats();
      }
    };

    socket.on('chat_message', onMessage);
    return () => {
      socket.off('chat_message', onMessage);
    };
  }, [socket]);

  const fetchChats = async () => {
    try {
      const data = await fetch('/api/chats').then(r => r.json());
      // Sort by latest message timestamp
      data.sort((a: any, b: any) => {
        const timeA = a.lastMessage?.messageTimestamp || 0;
        const timeB = b.lastMessage?.messageTimestamp || 0;
        return timeB - timeA;
      });
      setChats(data);
    } catch (e) {
      toast.error('Failed to load chats');
    } finally {
      setLoadingChats(false);
    }
  };

  const fetchHistory = async (jid: string) => {
    try {
      const history = await fetch(`/api/history/${encodeURIComponent(jid)}`).then(r => r.json());
      setMessages(history);
    } catch (e) {
      toast.error('Failed to load history');
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeChat || status !== 'connected') return;

    const msg = newMessage;

    try {
      const response = await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: activeChat.jid, message: msg })
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        toast.error(data.error || 'Failed to send message');
        return;
      }
      setNewMessage('');
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const getMessageText = (msg: any) => {
    return msg?.message?.conversation || msg?.message?.extendedTextMessage?.text || '';
  };

  const formatTime = (ts: any) => {
    if (!ts) return '';
    return new Date(Number(ts) * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] border border-border rounded-xl overflow-hidden bg-surface">
      {/* Sidebar - Chat List */}
      <div className="w-80 border-r border-border flex flex-col bg-surface">
        <div className="p-4 border-b border-border font-semibold text-lg">Chats</div>
        <div className="flex-1 overflow-y-auto">
          {loadingChats ? (
            <div className="p-4 text-center text-muted text-sm">Loading...</div>
          ) : chats.length === 0 ? (
            <div className="p-4 text-center text-muted text-sm">No recent chats</div>
          ) : (
            chats.map(chat => (
              <div
                key={chat.jid}
                onClick={() => setActiveChat(chat)}
                className={clsx(
                  "p-4 border-b border-border/50 cursor-pointer transition-colors flex items-center gap-3",
                  activeChat?.jid === chat.jid ? "bg-accent/10" : "hover:bg-bg/50"
                )}
              >
                <div className="w-10 h-10 rounded-full bg-border flex items-center justify-center shrink-0">
                  <User className="w-5 h-5 text-muted" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline mb-1">
                    <h4 className="font-medium text-sm truncate">{chat.name}</h4>
                    <span className="text-xs text-muted shrink-0">
                      {formatTime(chat.lastMessage?.messageTimestamp)}
                    </span>
                  </div>
                  <p className="text-xs text-muted truncate">
                    {chat.lastMessage?.key?.fromMe ? 'You: ' : ''}
                    {getMessageText(chat.lastMessage) || '...'}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-bg/50 relative">
        {activeChat ? (
          <>
            <div className="p-4 bg-surface border-b border-border flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-border flex items-center justify-center shrink-0">
                <User className="w-5 h-5 text-muted" />
              </div>
              <div>
                <h3 className="font-semibold">{activeChat.name}</h3>
                <p className="text-xs text-muted">{activeChat.jid}</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((msg, i) => {
                const text = getMessageText(msg);
                if (!text) return null;
                const isMe = msg.key?.fromMe;

                return (
                  <div key={msg.key?.id || i} className={clsx("flex", isMe ? "justify-end" : "justify-start")}>
                    <div className={clsx(
                      "max-w-[70%] rounded-xl px-4 py-2 text-sm",
                      isMe ? "bg-accent text-white rounded-br-none" : "bg-surface border border-border rounded-bl-none"
                    )}>
                      <p className="whitespace-pre-wrap break-words">{text}</p>
                      <span className={clsx(
                        "text-[10px] mt-1 block text-right",
                        isMe ? "text-white/70" : "text-muted"
                      )}>
                        {formatTime(msg.messageTimestamp)}
                      </span>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={sendMessage} className="p-4 bg-surface border-t border-border flex items-center gap-2">
              <input
                type="text"
                value={newMessage}
                onChange={e => setNewMessage(e.target.value)}
                placeholder={status === 'connected' ? "Type a message..." : "Waiting for WhatsApp connection..."}
                disabled={status !== 'connected'}
                className="flex-1 bg-bg border border-border rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-accent disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!newMessage.trim() || status !== 'connected'}
                className="p-2 bg-accent hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
              >
                <Send className="w-5 h-5" />
              </button>
            </form>
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-muted">
            <div className="text-center">
              <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p>Select a chat to start messaging</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Chat;
