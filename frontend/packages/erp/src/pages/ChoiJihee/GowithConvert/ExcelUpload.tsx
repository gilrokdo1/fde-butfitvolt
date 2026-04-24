import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import type { MonthData, RowData } from './types';
import s from './ExcelUpload.module.css';

interface UploadedFileMeta {
  id: string;
  name: string;
  size: number;
  yearMonth: string;
  uploadedAt: string;
}

const META_KEY = 'gowith_uploaded_files';
const DATA_KEY = (ym: string) => `gowith_data_${ym}`;

function loadMeta(): UploadedFileMeta[] {
  try {
    const raw = localStorage.getItem(META_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveMeta(files: UploadedFileMeta[]) {
  localStorage.setItem(META_KEY, JSON.stringify(files));
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function parseExcel(file: File): Promise<{ yearMonth: string; rows: RowData[] }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array', cellDates: false });
        const ws = wb.Sheets[wb.SheetNames[0] as string];
        if (!ws) throw new Error('시트를 찾을 수 없습니다.');

        // 조회연월: B1 (row 0, col 1)
        const b1 = ws[XLSX.utils.encode_cell({ r: 0, c: 1 })];
        const yearMonth = String(b1?.v ?? '').replace(/\D/g, '').slice(0, 6);

        // 헤더: row 4 (0-indexed: 3), 데이터: row 5부터 (0-indexed: 4)
        const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1');
        const rows: RowData[] = [];

        for (let r = 4; r <= range.e.r; r++) {
          const get = (c: number): string => {
            const cell = ws[XLSX.utils.encode_cell({ r, c })];
            if (!cell) return '';
            // 날짜 셀: formatted text 우선
            return String(cell.w ?? cell.v ?? '');
          };
          const getNum = (c: number): number => {
            const cell = ws[XLSX.utils.encode_cell({ r, c })];
            return Number(cell?.v) || 0;
          };

          const submitter = get(13); // N열
          const usageDate = get(1);  // B열
          if (!submitter && !usageDate) continue;

          rows.push({
            id: `${yearMonth}_${r - 4}`,
            usageDate,
            cardCompany: get(3),       // D
            cardNumber: get(4),        // E
            approvalNumber: get(5),    // F
            amount: getNum(6),         // G
            memo: get(10),             // K
            cardNickname: get(11),     // L
            submitter,
            accountSubject: get(19),   // T
            approvedAmount: getNum(22),// W
            rejectedAmount: getNum(23),// X
            nonDeductible: get(18) === '불공제', // S
            businessType: get(26),     // AA
            domesticForeign: get(28),  // AC
          });
        }

        resolve({ yearMonth, rows });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

export default function ExcelUpload() {
  const [files, setFiles] = useState<UploadedFileMeta[]>(loadMeta);
  const [isDragging, setIsDragging] = useState(false);
  const [toast, setToast] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const handleFiles = async (incoming: FileList | null) => {
    if (!incoming) return;
    const xlsxFiles = Array.from(incoming).filter(
      (f) => f.name.endsWith('.xlsx') || f.name.endsWith('.xls'),
    );
    if (xlsxFiles.length === 0) {
      showToast('xlsx 또는 xls 파일만 업로드할 수 있습니다.');
      return;
    }

    setLoading(true);
    const newMeta: UploadedFileMeta[] = [];

    for (const file of xlsxFiles) {
      try {
        const { yearMonth, rows } = await parseExcel(file);

        if (!yearMonth || yearMonth.length !== 6) {
          showToast(`${file.name}: 조회연월을 읽을 수 없습니다. (B1 셀 확인)`);
          continue;
        }

        const monthData: MonthData = {
          yearMonth,
          fileName: file.name,
          uploadedAt: new Date().toLocaleString('ko-KR'),
          rows,
        };

        localStorage.setItem(DATA_KEY(yearMonth), JSON.stringify(monthData));

        newMeta.push({
          id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
          name: file.name,
          size: file.size,
          yearMonth,
          uploadedAt: monthData.uploadedAt,
        });
      } catch {
        showToast(`${file.name}: 파싱 중 오류가 발생했습니다.`);
      }
    }

    if (newMeta.length > 0) {
      // 같은 연월 중복 제거 후 앞에 추가
      const existing = files.filter(
        (f) => !newMeta.some((n) => n.yearMonth === f.yearMonth),
      );
      const updated = [...newMeta, ...existing];
      setFiles(updated);
      saveMeta(updated);
      showToast(`${newMeta.length}개 파일이 등록되었습니다.`);
    }

    setLoading(false);
    // reset input
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleDelete = (id: string) => {
    const target = files.find((f) => f.id === id);
    if (target) localStorage.removeItem(DATA_KEY(target.yearMonth));
    const updated = files.filter((f) => f.id !== id);
    setFiles(updated);
    saveMeta(updated);
  };

  const formatYM = (ym: string) =>
    `${ym.slice(0, 4)}년 ${String(parseInt(ym.slice(4, 6)))}월`;

  return (
    <div className={s.wrap}>
      <div className={s.sectionHeader}>
        <h2 className={s.sectionTitle}>엑셀 업로드</h2>
        <p className={s.sectionDesc}>
          고위드 카드 월별 내역 파일(xlsx)을 업로드합니다.
          업로드 시 데이터가 파싱되어 월별 내역 확인에 즉시 반영됩니다.<br />
          예: <code className={s.code}>고위드_1월_일반.xlsx</code>
        </p>
      </div>

      {/* 드롭존 */}
      <div
        className={`${s.dropzone} ${isDragging ? s.dragging : ''} ${loading ? s.loading : ''}`}
        onClick={() => !loading && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
      >
        {loading ? (
          <>
            <span className={s.dropIcon} style={{ fontFamily: 'Tossface' }}>⏳</span>
            <p className={s.dropText}>파싱 중...</p>
          </>
        ) : (
          <>
            <span className={s.dropIcon} style={{ fontFamily: 'Tossface' }}>📂</span>
            <p className={s.dropText}>클릭하거나 파일을 여기에 끌어다 놓으세요</p>
            <p className={s.dropHint}>.xlsx, .xls 파일 지원</p>
          </>
        )}
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
            <span>연월</span>
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
              <div className={s.fileYM}>{formatYM(f.yearMonth)}</div>
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

      {toast && <div className={s.toast}>{toast}</div>}
    </div>
  );
}
