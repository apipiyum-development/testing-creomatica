
import { CouncilResponse } from "../types";

export const executeCouncilDeliberation = async (query: string): Promise<CouncilResponse> => {
  const response = await fetch('https://ваш_домен.ru/council', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    throw new Error(`Совет не смог прийти к консенсусу: ${response.status}`);
  }

  const data = await response.json();
  return data as CouncilResponse;
};

// Тип для функции обратного вызова для обновления UI
type StreamUpdateCallback = (stage: 'stage1' | 'stage2' | 'stage3', data: any) => void;

export const executeCouncilDeliberationStream = (
 query: string,
  onUpdate?: StreamUpdateCallback
): Promise<CouncilResponse> => {
  return new Promise((resolve, reject) => {
    // Для стриминга через POST запрос, нужно использовать другой подход
    // потому что EventSource не поддерживает POST запросы
     
    // Отправляем запрос на стриминг
    fetch('https://ваш_домен.ru/council/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query })
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`Совет не смог прийти к консенсусу: ${response.status}`);
      }

      // Для обработки Server-Sent Events (SE) нам нужно читать поток
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Unable to read response stream');
      }

      // Объект для хранения промежуточных результатов
      const results = {
        opinions: [] as { name: string; content: string }[],
        reviews: [] as { name: string; content: string }[],
        consensus: ""
      };

      // Буфер для хранения данных
      let buffer = '';

      const processStream = () => {
        reader.read().then(({ done, value }) => {
          if (done) {
            reader.releaseLock();
            return;
          }

          // Добавляем новые данные к буферу
          buffer += new TextDecoder().decode(value);

          // Разбиваем буфер на строки и обрабатываем события
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Сохраняем неполные строки в буфере

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const eventData = JSON.parse(line.substring(6)); // Убираем 'data: ' префикс

                // Обработка событий по этапам
                switch (eventData.stage) {
                  case 'stage1':
                    if (eventData.model && eventData.response) {
                      results.opinions.push({
                        name: eventData.model,
                        content: eventData.response
                      });
                      // Вызываем callback для обновления UI при получении данных
                      if (onUpdate) onUpdate('stage1', { opinions: results.opinions });
                    } else if (eventData.status === 'completed') {
                      // Этап 1 завершен, можно обновить UI
                      console.log('Stage 1 completed');
                      if (onUpdate) onUpdate('stage1', { status: 'completed' });
                    }
                    break;

                  case 'stage2':
                    if (eventData.model && eventData.response) {
                      results.reviews.push({
                        name: eventData.model,
                        content: eventData.response
                      });
                      // Вызываем callback для обновления UI при получении данных
                      if (onUpdate) onUpdate('stage2', { reviews: results.reviews });
                    } else if (eventData.status === 'completed') {
                      // Этап 2 завершен, можно обновить UI
                      console.log('Stage 2 completed');
                      if (onUpdate) onUpdate('stage2', { status: 'completed' });
                    }
                    break;

                  case 'stage3':
                    if (eventData.response) { // Исправляем: в stage3 нет поля eventData.model
                      results.consensus = eventData.response;
                      // Вызываем callback для обновления UI при получении данных
                      if (onUpdate) onUpdate('stage3', { consensus: results.consensus });
                    } else if (eventData.status === 'completed') {
                      // Этап 3 завершен, можно обновить UI
                      console.log('Stage 3 completed');
                      if (onUpdate) onUpdate('stage3', { status: 'completed' });
                    }
                    break;

                  case 'done':
                    if (eventData.status === 'completed') {
                      // Все этапы завершены, возвращаем результат
                      resolve(results);
                      reader.cancel();
                      return;
                    }
                    break;

                  case 'error':
                    // В случае ошибки, все равно возвращаем текущие результаты, если есть
                    // чтобы UI мог отобразить частичные данные или сообщение об ошибке
                    console.error('Council deliberation error:', eventData.message || 'Unknown error');
                    reject(new Error(eventData.message || 'Error during council deliberation'));
                    reader.cancel();
                    return;
                }
              } catch (error) {
                reject(new Error(`Error parsing event data: ${error}`));
                reader.cancel();
                return;
              }
            }
          }

          // Продолжаем обработку потока
          processStream();
        }).catch(error => {
          reject(new Error(`Stream error: ${error}`));
          reader.cancel();
        });
      };

      processStream();
    })
    .catch(error => {
      reject(new Error(`Failed to initiate stream: ${error}`));
    });
  });
};
