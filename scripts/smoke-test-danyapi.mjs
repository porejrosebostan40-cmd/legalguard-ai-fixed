const baseUrl = 'https://danyapi.cloudpub.ru/v1';
const model = 'deepseek-chat';

async function request(path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer sk-dummy',
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 500)}`);
  }
  return JSON.parse(text);
}

console.log('ПРОВЕРКА DanyAPI: доступность OpenAI-совместимого DeepSeek');
console.log(`Адрес: ${baseUrl}`);
console.log(`Модель: ${model}`);

const result = await request('/chat/completions', {
  model,
  messages: [
    { role: 'user', content: 'Ответь одним словом: работает.' },
  ],
  stream: false,
});

const content = result?.choices?.[0]?.message?.content;
if (typeof content !== 'string' || content.trim() === '') {
  throw new Error('DanyAPI ответил, но не вернул текст модели.');
}

console.log('DanyAPI: HTTP 200, модель вернула ответ.');
console.log(`Ответ модели: ${content.trim().slice(0, 200)}`);
