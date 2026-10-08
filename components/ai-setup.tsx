'use client';
import { useState } from 'react';
export default function AiSetup({ onChanged }: { onChanged: () => void }) {
  const [provider, setProvider] = useState('deepseek');
  const [baseUrl, setBaseUrl] = useState('https://api.deepseek.com');
  const [model, setModel] = useState('');
  const [apiKey, setKey] = useState('');
  const [vision, setVision] = useState(false);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  async function performAction(operation: 'save' | 'test' | 'clear') {
    setBusy(true);
    setMessage('');
    try {
      const r = await fetch('/api/ai-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          operation === 'save'
            ? { action: operation, config: { baseUrl, model, apiKey, vision } }
            : { action: operation },
        ),
      });
      const data = (await r.json()) as { error?: string; message: string };
      if (!r.ok) throw new Error(data.error || '连接失败，请重试。');
      if (operation === 'save') setKey('');
      setMessage(data.message);
      onChanged();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '请求失败');
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="ai-setup">
      <summary>连接 AI · 配置与测试</summary>
      <p>① 选择服务　② 保存配置　③ 测试连接</p>
      <label>
        AI 服务
        <select
          value={provider}
          disabled={busy}
          onChange={(e) => {
            setProvider(e.target.value);
            setBaseUrl(
              e.target.value === 'deepseek' ? 'https://api.deepseek.com' : '',
            );
            setModel('');
            setKey('');
          }}
        >
          <option value="deepseek">DeepSeek 官网</option>
          <option value="custom">其他兼容服务 / 本机模型</option>
        </select>
      </label>
      <label>
        服务地址
        <input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://服务地址/v1"
          disabled={busy}
        />
      </label>
      <label>
        模型名称
        <input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="填写服务商控制台中的模型 ID"
          maxLength={120}
          disabled={busy}
        />
      </label>
      <label>
        API 密钥
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setKey(e.target.value)}
          autoComplete="new-password"
          spellCheck={false}
          maxLength={2048}
          disabled={busy}
        />
      </label>
      <label className="check-label">
        <input
          type="checkbox"
          checked={vision}
          onChange={(e) => setVision(e.target.checked)}
          disabled={busy}
        />
        该模型支持图片输入
      </label>
      <p className="muted small">
        密钥仅提交到本机服务端并加密保存，不进入学习备份。测试只发送一句连通性问候，不发送教材；会产生一次少量模型调用。保存新服务时请同时填写新密钥。
      </p>
      <div className="actions">
        <button
          disabled={busy || !apiKey || !model || !baseUrl}
          onClick={() => void performAction('save')}
        >
          保存 AI 配置
        </button>
        <button disabled={busy} onClick={() => void performAction('test')}>
          测试已保存的连接
        </button>
      </div>
      <details>
        <summary>清除界面保存的配置</summary>
        <p>清除后使用本机环境文件中的配置。</p>
        <button disabled={busy} onClick={() => void performAction('clear')}>
          确认清除 AI 配置
        </button>
      </details>
      {message && <output>{message}</output>}
    </details>
  );
}
