export interface RowData {
  id: string;
  usageDate: string;        // B열 사용일자
  cardCompany: string;      // D열 카드사
  cardNumber: string;       // E열 카드번호
  approvalNumber: string;   // F열 승인번호
  amount: number;           // G열 이용금액(원)
  memo: string;             // K열 메모
  cardNickname: string;     // L열 카드별칭
  submitter: string;        // N열 제출자
  accountSubject: string;   // T열 계정과목
  approvedAmount: number;   // W열 관리자의 승인금액(원)
  rejectedAmount: number;   // X열 관리자의 반려금액(원)
  nonDeductible: boolean;   // S열 불공제 여부 (원본)
  businessType: string;     // AA열 사업자 유형 (간이 판별)
  domesticForeign: string;  // AC열 국내/외 구분
}

export interface MonthData {
  yearMonth: string;    // '202601' 형식
  fileName: string;
  uploadedAt: string;
  rows: RowData[];
}

export type NonDeductibleOverrides = Record<string, boolean>;

export interface Employee {
  id: string;
  name: string;
  code: string;
  branch: string;
}
