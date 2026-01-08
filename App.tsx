
import React, { useState, useCallback, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { DeliberationStage, CouncilState } from './types';
import { MODELS, STAGES, CREOMATICA_LOGO } from './constants';
import { executeCouncilDeliberation, executeCouncilDeliberationStream } from './services/geminiService';
import CosmicSoundToggle from '@/src/components/CosmicSoundToggle';

// Предварительная загрузка изображения и звука
const preloadResources = async () => {
  // Загрузка изображения
  const img = new Image();
  img.src = '/assets/hero/ready_consil.jpg';
  await new Promise((resolve) => {
    img.onload = resolve;
    img.onerror = resolve; // Резолвим даже в случае ошибки
  });

  // Загрузка звука
  const audio = new Audio('/assets/hero/sample.mp3');
  audio.preload = 'auto';
  // Ждем метаданных, чтобы убедиться, что аудио готово
  await new Promise((resolve) => {
    audio.onloadedmetadata = resolve;
    audio.onerror = resolve; // Резолвим даже в случае ошибки
  });
};

const App: React.FC = () => {
  const [resourcesLoaded, setResourcesLoaded] = useState(false);
  const [state, setState] = useState<CouncilState>({
    stage: DeliberationStage.IDLE,
    query: '',
    opinions: [],
    reviews: [],
    consensus: '',
    isLoading: false,
    error: null,
  });

  const [viewStage, setViewStage] = useState<DeliberationStage>(DeliberationStage.IDLE);
  const [feedbackGiven, setFeedbackGiven] = useState<boolean | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Таймеры для задержки переходов между стадиями
  const stageTransitionTimer = useRef<NodeJS.Timeout | null>(null);
  
  // Загружаем ресурсы при монтировании компонента
  useEffect(() => {
    preloadResources().then(() => {
      setResourcesLoaded(true);
    });
  }, []);

  // Очистка таймеров при размонтировании
  useEffect(() => {
    return () => {
      if (stageTransitionTimer.current) {
        clearTimeout(stageTransitionTimer.current);
      }
    };
  }, []);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!state.query.trim() || state.isLoading) return;

    setState(prev => ({ ...prev, isLoading: true, error: null, stage: DeliberationStage.STAGE_1 }));
    setViewStage(DeliberationStage.STAGE_1);
    setFeedbackGiven(null);

    try {
      // Используем стриминговую функцию с обновлениями UI в реальном времени
      const data = await executeCouncilDeliberationStream(state.query, (stage, data) => {
        // Обновляем состояние по мере получения данных из стрима
        setState(prev => {
          const newState = { ...prev };
          
          if (stage === 'stage1') {
            if (data.opinions) {
              newState.opinions = data.opinions.map((o: { name: string; content: string }) => ({
                id: o.name.toLowerCase(),
                name: o.name,
                color: MODELS.find(m => m.name === o.name.toUpperCase())?.color || 'text-white',
                opinion: o.content
              }));
            } else if (data.status === 'completed') {
              // Добавляем задержку перед переходом к Stage 2, только если таймер еще не установлен
              if (!stageTransitionTimer.current) {
                stageTransitionTimer.current = setTimeout(() => {
                  setState(prev => ({ ...prev, stage: DeliberationStage.STAGE_2 }));
                  setViewStage(DeliberationStage.STAGE_2);
                  // Сброс таймера после выполнения
                  stageTransitionTimer.current = null;
                }, 2500); // 2.5 секунды задержка
              }
            }
          } else if (stage === 'stage2') {
            if (data.reviews) {
              newState.reviews = data.reviews.map((o: { name: string; content: string }) => ({
                id: o.name.toLowerCase(),
                name: o.name,
                color: MODELS.find(m => m.name === o.name.toUpperCase())?.color || 'text-white',
                opinion: o.content
              }));
            } else if (data.status === 'completed') {
              // Добавляем задержку перед переходом к Stage 3, только если таймер еще не установлен
              if (!stageTransitionTimer.current) {
                stageTransitionTimer.current = setTimeout(() => {
                  setState(prev => ({ ...prev, stage: DeliberationStage.STAGE_3 }));
                  setViewStage(DeliberationStage.STAGE_3);
                  // Сброс таймера после выполнения
                  stageTransitionTimer.current = null;
                }, 2500); // 2.5 секунды задержка
              }
            }
          } else if (stage === 'stage3') {
            if (data.consensus !== undefined) {
              newState.consensus = data.consensus;
            } else if (data.status === 'completed') {
              newState.isLoading = false;
            }
          }
          
          return newState;
        });
      });

      // Финальное обновление состояния после завершения стрима
      setState(prev => ({
        ...prev,
        opinions: data.opinions.map(o => ({
          id: o.name.toLowerCase(),
          name: o.name,
          color: MODELS.find(m => m.name === o.name.toUpperCase())?.color || 'text-white',
          opinion: o.content
        })),
        reviews: data.reviews.map(o => ({
          id: o.name.toLowerCase(),
          name: o.name,
          color: MODELS.find(m => m.name === o.name.toUpperCase())?.color || 'text-white',
          opinion: o.content
        })),
        consensus: data.consensus,
        isLoading: false
      }));
      
      // Очистка таймера после завершения стрима
      if (stageTransitionTimer.current) {
        clearTimeout(stageTransitionTimer.current);
        stageTransitionTimer.current = null;
      }

    } catch (err: any) {
      // Очистка таймера при ошибке
      if (stageTransitionTimer.current) {
        clearTimeout(stageTransitionTimer.current);
        stageTransitionTimer.current = null;
      }
      
      setState(prev => ({ ...prev, error: err.message, isLoading: false, stage: DeliberationStage.IDLE }));
      setViewStage(DeliberationStage.IDLE);
    }
  };

  const reset = () => {
    // Очистка таймера при перезапуске
    if (stageTransitionTimer.current) {
      clearTimeout(stageTransitionTimer.current);
      stageTransitionTimer.current = null;
    }
    
    setState({
      stage: DeliberationStage.IDLE,
      query: '',
      opinions: [],
      reviews: [],
      consensus: '',
      isLoading: false,
      error: null,
    });
    setViewStage(DeliberationStage.IDLE);
    setFeedbackGiven(null);
 };

  const handleStageClick = (targetStage: DeliberationStage) => {
    const stageOrder = [DeliberationStage.STAGE_1, DeliberationStage.STAGE_2, DeliberationStage.STAGE_3];
    const currentProgressIdx = stageOrder.indexOf(state.stage);
    const targetIdx = stageOrder.indexOf(targetStage);
    if (targetIdx <= currentProgressIdx && targetIdx !== -1) {
      setViewStage(targetStage);
    }
  };

  // Показываем индикатор загрузки до загрузки ресурсов
  if (!resourcesLoaded) {
    return (
      <div className="relative h-screen w-full bg-black text-white overflow-hidden select-none font-light tracking-tight flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-500 mb-4"></div>
          <p className="text-white/40">Загрузка ресурсов...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-screen w-full bg-black text-white overflow-hidden select-none font-light tracking-tight">
      {/* Immersive Background */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-black/80" />
        
        {/* Animated Energy Vortex */}
        <div className="energy-vortex">
          <div className="energy-layer layer-1" />
          <div className="energy-layer layer-2" />
          <div className="energy-layer layer-3" />
        </div>
      </div>

      {/* Header */}
      <header className="absolute top-0 left-0 w-full p-4 sm:p-6 md:p-12 flex flex-col sm:flex-row justify-between items-center gap-4 z-50">
        <div className="opacity-60 hover:opacity-100 transition-opacity duration-700">
          {CREOMATICA_LOGO}
        </div>
        <div className="flex items-center gap-6 font-mono text-[9px] tracking-[0.2em] text-white/40 uppercase">
          <div className="flex items-center gap-2">
            <div className={`w-1 h-1 rounded-full ${state.isLoading ? 'bg-purple-500 animate-pulse shadow-[0_0_8px_#9d00ff]' : 'bg-white/20'}`} />
            <span>{state.isLoading ? 'Processing' : 'Standby'}</span>
          </div>
          <span className="hidden md:inline border-l border-white/10 pl-6">Neural Council v4.0.8</span>
        </div>
      </header>

      <main className="relative z-20 h-full flex flex-col items-center justify-center px-4 sm:px-6">
        
        {/* IDLE: Initial State */}
        {state.stage === DeliberationStage.IDLE && (
          <div className="w-full max-w-5xl flex flex-col items-center gap-8 sm:gap-16 content-enter">
            
            <div className="text-center space-y-5">
              <h1 className="text-3xl md:text-5xl font-light tracking-[-0.03em] uppercase text-gradient-council">
                Совет Нейросетей
              </h1>
              <div className="h-[1px] w-16 bg-purple-500/30 mx-auto" />
              <p className="text-[10px] md:text-[12px] text-white/40 tracking-[0.8em] uppercase font-medium pl-4">
                Синтез коллективного разума
              </p>
            </div>

            {/* Hero Image - Совет нейросетей */}
            <div className="w-full max-w-4xl mx-auto my-4 sm:my-8">
              <img
                src="/assets/hero/ready_consil.jpg"
                alt="Совет нейросетей - коллективный разум"
                className="w-full h-auto rounded-xl shadow-2xl hover:shadow-purple-50/20 transition-all duration-300 hover:scale-[1.02] border border-purple-500/20"
              />
            </div>

            <form onSubmit={handleSubmit} className="w-full max-w-3xl flex flex-col items-center gap-14">
              <div className="w-full relative group">
                <input
                  ref={inputRef}
                  autoFocus
                  type="text"
                  value={state.query}
                  onChange={(e) => setState(prev => ({ ...prev, query: e.target.value }))}
                  placeholder="Задайте свой вопрос Высшему Совету..."
                  className="w-full bg-transparent border-b border-white/10 px-0 py-4 sm:py-8 text-lg sm:text-2xl md:text-4xl font-light text-center focus:outline-none focus:border-purple-500/40 transition-all duration-1000 placeholder:text-white/10 text-white/90 selection:bg-purple-500/20"
                />
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-0 h-[1px] bg-purple-500 group-focus-within:w-full transition-all duration-1000 opacity-40" />
              </div>
              
              <div className={`flex flex-col items-center gap-4 sm:gap-6 transition-all duration-1000 ${state.query.trim() ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'}`}>
                <button 
                  type="submit"
                  className="btn-enter-elegant px-16 py-4 rounded-full text-[12px] tracking-[0.2em] uppercase font-bold flex items-center gap-4"
                >
                  Активировать Совет
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                </button>
                <span className="text-[10px] text-white/20 tracking-[0.3em] font-mono uppercase">Confirm with Enter</span>
              </div>
            </form>
          </div>
        )}

        {/* ACTIVE: Deliberation Stages */}
        {state.stage !== DeliberationStage.IDLE && (
          <div className="w-full h-full pt-24 sm:pt-44 pb-8 sm:pb-20 flex flex-col items-center gap-8 sm:gap-14 overflow-hidden content-enter">
            
            {/* Step Indicators */}
            <nav className="flex flex-wrap items-center justify-center gap-2 sm:gap-4 md:gap-14 shrink-0 z-30">
              {STAGES.map((s) => {
                const isActiveStage = viewStage === s.value;
                const isReached = STAGES.findIndex(x => x.value === state.stage) >= STAGES.findIndex(x => x.value === s.value);
                
                return (
                  <button 
                    key={s.id} 
                    onClick={() => handleStageClick(s.value as DeliberationStage)}
                    disabled={!isReached}
                    className={`flex flex-col items-center gap-4 transition-all duration-1000 ${isActiveStage ? 'opacity-100' : isReached ? 'opacity-40 hover:opacity-70' : 'opacity-10 cursor-not-allowed'}`}
                  >
                    <div className="relative">
                      <div className={`h-[2px] w-24 md:w-56 transition-all duration-1000 ${isActiveStage ? 'bg-purple-500 shadow-[0_0_20px_#9d00ff]' : 'bg-white/20'}`} />
                    </div>
                    <div className={`text-[10px] uppercase tracking-[0.5em] font-bold ${isActiveStage ? 'text-white' : 'text-white/40'}`}>
                      {s.label}
                    </div>
                  </button>
                );
              })}
            </nav>

            <div className="flex-1 w-full flex flex-col items-center overflow-y-auto custom-scrollbar gap-14 px-4 pb-12 max-w-7xl">
              {/* Question Banner */}
              <div className="text-center font-light text-white/60 text-lg md:text-xl max-w-4xl italic px-10 border-l border-purple-500/20 leading-relaxed">
                &ldquo;{state.query}&rdquo;
              </div>

              {/* Grid of Model Responses */}
              {(viewStage === DeliberationStage.STAGE_1 || viewStage === DeliberationStage.STAGE_2) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-8 w-full animate-[contentIn_1s_ease-out]">
                  {MODELS.map((m) => {
                    const opinion = state.opinions.find(o => o.name.toUpperCase() === m.name);
                    const review = state.reviews.find(r => r.name.toUpperCase() === m.name);
                    const content = viewStage === DeliberationStage.STAGE_1 ? opinion?.opinion : review?.opinion;
                    
                    return (
                      <div 
                        key={m.id}
                        className="glass p-12 rounded-[4px] flex flex-col gap-6 transition-all duration-1000 hover:border-purple-500/30 group relative overflow-hidden"
                      >
                        <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-transparent via-purple-500/40 to-transparent" />
                        <div className="flex justify-between items-center border-b border-white/5 pb-6">
                          <div className="flex items-center gap-4">
                            <div className={`w-1.5 h-1.5 rounded-full ${m.accent} opacity-60 group-hover:opacity-100 group-hover:shadow-[0_0_12px_#ffffff] transition-all`} />
                            <span className={`${m.color} text-[13px] tracking-[0.4em] font-bold uppercase`}>{m.name}</span>
                          </div>
                          <span className="text-[9px] text-white/20 font-mono tracking-widest uppercase">
                            {viewStage === DeliberationStage.STAGE_1 ? 'Initial' : 'Audit'}
                          </span>
                        </div>
                        <div className="flex-1 text-[15px] md:text-[16px] font-light text-white/70 leading-[1.8] overflow-y-auto pr-4 custom-scrollbar min-h-[140px] selection:bg-purple-500/30">
                          <div className="markdown-content">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {content || (state.isLoading ? 'Синхронизация данных...' : viewStage === DeliberationStage.STAGE_2 ? 'Оцениваю ответы...' : 'Ожидание...')}
                            </ReactMarkdown>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Final Consensus Block */}
              {viewStage === DeliberationStage.STAGE_3 && (
                <div className="w-full max-w-5xl glass p-6 sm:p-14 md:p-28 rounded-[4px] space-y-8 sm:space-y-16 animate-[contentIn_1s_ease-out] relative">
                  <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-purple-500/40 to-transparent" />
                  
                  <div className="flex flex-col items-center gap-8">
                    <div className="text-[12px] text-white/30 tracking-[1.8em] uppercase font-bold pl-6">Вердикт Совета</div>
                    <div className="h-[1px] w-20 bg-purple-500/30" />
                  </div>
                  
                  <div className="text-base sm:text-xl md:text-3xl font-light leading-relaxed text-center text-white/90 selection:bg-purple-500/30 tracking-tight max-w-4xl mx-auto">
                    <div className="markdown-content">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {state.consensus || 'Синтез финального решения...'}
                      </ReactMarkdown>
                    </div>
                  </div>

                  {state.consensus && (
                    <div className="pt-24 flex flex-col items-center gap-20 animate-[contentIn_2s_ease-out]">
                      <div className="flex items-center gap-20 md:gap-32">
                        <button 
                          onClick={() => setFeedbackGiven(true)} 
                          className={`group flex flex-col items-center gap-5 transition-all duration-700 ${feedbackGiven === true ? 'text-white' : 'text-white/20 hover:text-white/60'}`}
                        >
                          <span className="text-[13px] tracking-[0.4em] uppercase font-bold">Принято</span>
                          <div className={`h-[1px] transition-all duration-1000 ${feedbackGiven === true ? 'bg-purple-500 w-32 shadow-[0_0_20px_#9d00ff]' : 'bg-white/10 w-16 group-hover:w-32'}`} />
                        </button>
                        <button 
                          onClick={() => setFeedbackGiven(false)} 
                          className={`group flex flex-col items-center gap-5 transition-all duration-700 ${feedbackGiven === false ? 'text-white' : 'text-white/20 hover:text-white/60'}`}
                        >
                          <span className="text-[13px] tracking-[0.4em] uppercase font-bold">Оспорить</span>
                          <div className={`h-[1px] transition-all duration-1000 ${feedbackGiven === false ? 'bg-purple-500 w-32 shadow-[0_0_20px_#9d00ff]' : 'bg-white/10 w-16 group-hover:w-32'}`} />
                        </button>
                      </div>

                      <button
                        onClick={reset}
                        className="text-[9px] sm:text-[11px] tracking-[0.8em] sm:tracking-[1.2em] uppercase text-white/20 hover:text-white transition-all duration-1000 flex items-center gap-8 sm:gap-16 group"
                      >
                        <span className="w-12 sm:w-20 h-[1px] bg-white/5 group-hover:bg-purple-500/40 group-hover:w-24 sm:group-hover:w-40 transition-all duration-1000" />
                        Новый Протокол
                        <span className="w-12 sm:w-20 h-[1px] bg-white/5 group-hover:bg-purple-500/40 group-hover:w-24 sm:group-hover:w-40 transition-all duration-1000" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="absolute bottom-0 left-0 w-full p-4 sm:p-10 flex flex-col sm:flex-row justify-between items-center sm:items-end pointer-events-none z-10 font-mono opacity-20 gap-4 sm:gap-0">
        <div className="text-[8px] sm:text-[10px] tracking-[0.4em] sm:tracking-[0.6em] text-white uppercase flex items-center gap-4 sm:gap-6">
          <div className="w-8 sm:w-12 h-[1px] bg-purple-500/40" />
          Protocol Stable // Sync 4.0.8
        </div>
        <div className="text-[8px] sm:text-[10px] tracking-[0.1em] sm:tracking-[0.2em] text-white/70 uppercase text-center sm:text-right leading-relaxed">
          Объективное решение через<br className="hidden sm:block"/>синтез нейронных мнений
        </div>
      </footer>
      <CosmicSoundToggle />
    </div>
  );
};

export default App;
