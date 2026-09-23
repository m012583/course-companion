import { useEffect, useState } from 'react';
export default function AISettings({ onSaved }: { onSaved: () => void }) {
  const [baseUrl, setBaseUrl] = useState('https://api.deepseek.com');
  const [model, setModel] = useState('deepseek-flash');
  const [apiKey, setApiKey] = useState('');
  const [configured, setConfigured] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    fetch('/api/ai-settings')
      .then(
        (r) =>
          r.json() as Promise<{
            error?: string;
            baseUrl: string;
            model: string;
            configured: boolean;
          }>,
      )
      .then((d) => {
        if (!active) return;
        if (d.error) {
          setMessage(d.error);
          return;
        }
        setBaseUrl(d.baseUrl);
        setModel(d.model);
        setConfigured(d.configured);
      })
      .catch(() => {
        if (active) setMessage('无法读取 AI 设置。');
      });
    return () => {
      active = false;
    };
  }, []);
  async function run(action: 'test' | 'save') {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      const r = await fetch('/api/ai-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, baseUrl, model, apiKey }),
      });
      const d = (await r.json()) as { error?: string; message: string };
      if (!r.ok) throw new Error(d.error || '操作失败');
      setMessage(d.message);
      if (action === 'save') {
        setApiKey('');
        setConfigured(true);
        onSaved();
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '连接失败');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="form-stack" aria-label="AI 服务配置">
      <p>
        {configured
          ? '已配置密钥；连接状态请点击测试确认。'
          : '尚未配置 AI 服务。'}
      </p>
      <fieldset disabled={busy} className="form-stack">
        <label>
          服务商
          <select
            value={
              baseUrl === 'https://api.deepseek.com' ? 'deepseek' : 'custom'
            }
            onChange={(e) => {
              setApiKey('');
              if (e.target.value === 'deepseek') {
                setBaseUrl('https://api.deepseek.com');
                setModel('deepseek-flash');
              } else {
                setBaseUrl('');
                setModel('');
              }
            }}
          >
            <option value="deepseek">DeepSeek</option>
            <option value="custom">其他兼容服务</option>
          </select>
        </label>
        <label>
          API 密钥
          <input
            type="password"
            autoComplete="new-password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={configured ? '留空保留已有密钥' : '粘贴平台生成的密钥'}
          />
        </label>
        <small>
          密钥仅保存到本机服务端，不随学习数据备份导出。更换服务地址时需要重新填写密钥。
        </small>
        <details>
          <summary>高级设置：服务地址与模型</summary>
          <label>
            服务地址
            <input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
          </label>
          <label>
            模型名称
            <input value={model} onChange={(e) => setModel(e.target.value)} />
          </label>
        </details>
        <div className="button-row">
          <button onClick={() => void run('test')}>测试连接</button>
          <button className="primary" onClick={() => void run('save')}>
            保存 AI 设置
          </button>
        </div>
      </fieldset>
      <small>测试会发送一条简短请求，可能产生少量费用。</small>
      {busy && <output>正在处理，请稍候…</output>}
      {message && <output>{message}</output>}
    </section>
  );
}
