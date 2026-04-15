import { useState, useRef } from 'react';
import s from './ExcelUpload.module.css';

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  uploadedAt: string;
}

const STORAGE_KEY = 'gowith_uploaded_files';

function loadFiles(): UploadedFile[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveFiles(files: UploadedFile[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(files));
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ExcelUpload() {
  const [files, setFiles] = useState<UploadedFile[]>(loadFiles);
  const [isDragging, setIsDragging] = useState(false);
  const [toast, setToast] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  const handleFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    const xlsxFiles = Array.from(incoming).filter((f) =>
      f.name.endsWith('.xlsx') || f.name.endsWith('.xls'),
    );
    if (xlsxFiles.length === 0) {
      showToast('xlsx 또는 xls 파일만 업로드할 수 있습니다.');
      return;
    }
    const newEntries: UploadedFile[] = xlsxFiles.map((f) => ({
      id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
      name: f.name,
      size: f.size,
      uploadedAt: new Date().toLocaleString('ko-KR'),
    }));
    const updated = [...newEntries, ...files];
    setFiles(updated);
    saveFiles(updated);
    showToast(`${xlsxFiles.length}개 파일이 등록되었습니다.`);
  };

  const handleDelete = (id: string) => {
    const updated = files.filter((f) => f.id !== id);
    setFiles(updated);
    saveFiles(updated);
  };

  return (
    <div className={s.wrap}>
      <div className={s.sectionHeader}>
        <h2 className={s.sectionTitle}>엑셀 업로드</h2>
        <p className={s.sectionDesc}>
          고위드 카드 월별 내역 파일(xlsx)을 업로드합니다.<br />
          예: <code className={s.code}>고위드_1월_일반.xlsx</code>
        </p>
      </div>

      {/* 드롭존 */}
      <div
        className={`${s.dropzone} ${isDragging ? s.dragging : ''}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
      >
        <span className={s.dropIcon} style={{ fontFamily: 'Tossface' }}>📂</span>
        <p className={s.dropText}>클릭하거나 파일을 여기에 끌어다 놓으세요</p>
        <p className={s.dropHint}>.xlsx, .xls 파일 지원</p>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          multiple
          className={s.hiddenInput}
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {/* 업로드 목록 */}
      {files.length > 0 && (
        <div className={s.fileList}>
          <div className={s.fileListHeader}>
            <span>파일명</span>
            <span>크기</span>
            <span>등록일시</span>
            <span />
          </div>
          {files.map((f) => (
            <div key={f.id} className={s.fileRow}>
              <div className={s.fileName}>
                <span className={s.fileIcon} style={{ fontFamily: 'Tossface' }}>📄</span>
                {f.name}
              </div>
              <div className={s.fileSize}>{formatBytes(f.size)}</div>
              <div className={s.fileDate}>{f.uploadedAt}</div>
              <button
                className={s.deleteBtn}
                onClick={() => handleDelete(f.id)}
                aria-label="삭제"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {files.length === 0 && (
        <p className={s.emptyMsg}>아직 업로드된 파일이 없습니다.</p>
      )}

      {/* 토스트 */}
      {toast && <div className={s.toast}>{toast}</div>}
    </div>
  );
}
