import { useLang } from '../i18n/LangContext';
import { AlphabetStudio } from './AlphabetStudio';

export function Settings() {
  const { lang, setLang } = useLang();
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="stage" style={{ padding: 16 }}>
        <h2 style={{ margin: 0 }}>设置 · Settings</h2>
        <p style={{ color: '#64748b', margin: '6px 0 0' }}>所有全局设置在此集中管理</p>
        <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: '#475569' }}>语言 / Language</span>
          <button className={`pill ${lang === 'zh' ? 'active' : ''}`} onClick={() => setLang('zh')}>中</button>
          <button className={`pill ${lang === 'en' ? 'active' : ''}`} onClick={() => setLang('en')}>En</button>
        </div>
      </div>
      <AlphabetStudio />
    </div>
  );
}
