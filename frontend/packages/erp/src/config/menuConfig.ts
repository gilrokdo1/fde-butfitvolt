export interface SubNavItem {
  label: string;
  to: string;
}

export interface MainMenu {
  id: string;
  label: string;
  image?: string;
  items: SubNavItem[];
}

export const MENU_CONFIG: MainMenu[] = [
  {
    id: 'fde',
    label: 'FDE 1기',
    items: [
      { label: 'FDE 1기', to: '/fde' },
      { label: '디자인 시스템', to: '/fde/design-system' },
    ],
  },
  {
    id: 'do-gilrok',
    label: '도길록',
    image: 'https://avatars.slack-edge.com/2025-01-23/8322354937335_ae387186ee47730fcee1_192.png',
    items: [
      { label: '도길록', to: '/fde/do-gilrok' },
      { label: '인스타 해시태그', to: '/fde/do-gilrok/insta-hashtag' },
    ],
  },
  {
    id: 'kim-dongha',
    label: '김동하',
    image: 'https://avatars.slack-edge.com/2025-07-13/9188618018178_924a00d486ce8b1d9760_192.jpg',
    items: [
      { label: '김동하', to: '/fde/kim-dongha' },
      { label: '실적분석', to: '/fde/kim-dongha/sales' },
    ],
  },
  {
    id: 'kim-soyeon',
    label: '김소연',
    image: 'https://avatars.slack-edge.com/2019-08-05/716125194373_fdeb89064ed323c13836_192.jpg',
    items: [
      { label: '김소연', to: '/fde/kim-soyeon' },
      { label: '팀버핏 유효회원', to: '/fde/kim-soyeon/teamfit-active' },
      { label: '멤버십 이상 감지', to: '/fde/kim-soyeon/anomaly-dashboard' },
    ],
  },
  {
    id: 'kim-youngshin',
    label: '김영신',
    image: 'https://avatars.slack-edge.com/2025-09-29/9604361354356_e3267eb003286226f52b_192.jpg',
    items: [
      { label: '김영신', to: '/fde/kim-youngshin' },
    ],
  },
  {
    id: 'park-mingyu',
    label: '박민규',
    image: 'https://avatars.slack-edge.com/2026-03-03/10649171595712_2e1fcdf4fe46dd9c391f_192.jpg',
    items: [
      { label: '박민규', to: '/fde/park-mingyu' },
      { label: 'TB 프리랜서 계약', to: '/fde/park-mingyu/contracts' },
    ],
  },
  {
    id: 'lee-yewon',
    label: '이예원',
    image: 'https://avatars.slack-edge.com/2024-07-29/7491135991875_45cd9161e243bc1f6dfe_192.jpg',
    items: [
      { label: '이예원', to: '/fde/lee-yewon' },
    ],
  },
  {
    id: 'jung-seokhwan',
    label: '정석환',
    image: 'https://ca.slack-edge.com/T3ZS68V1R-U06FS0EKMPG-9eac208f0783-512',
    items: [
      { label: '정석환', to: '/fde/jung-seokhwan' },
    ],
  },
  {
    id: 'choi-jihee',
    label: '최지희',
    image: 'https://avatars.slack-edge.com/2025-04-14/8746410027429_b0b7831a5031e48c6d0f_192.png',
    items: [
      { label: '최지희', to: '/fde/choi-jihee' },
      { label: '임대인 정산', to: '/fde/choi-jihee/landlord-settlement' },
      { label: '고위드 변환', to: '/fde/choi-jihee/gowith-convert' },
    ],
  },
  {
    id: 'choi-chihwan',
    label: '최치환',
    image: 'https://avatars.slack-edge.com/2024-10-01/7812698097300_4bb76c46a529999c1763_192.png',
    items: [
      { label: '최치환', to: '/fde/choi-chihwan' },
      { label: '유효회원 추출', to: '/fde/choi-chihwan/active-members' },
      { label: '경영 매뉴얼 챗봇', to: '/fde/choi-chihwan/manual-chat' },
      { label: '80점 경영 진단', to: '/fde/choi-chihwan/branch-diagnosis' },
    ],
  },
];
