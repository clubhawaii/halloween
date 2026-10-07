/* =====================================================================
 * 클럽하와이 2026 할로윈 포토부스 — 설정 파일
 * ---------------------------------------------------------------------
 * 카드 PNG 교체, 문구·질문·점수·텍스트 위치 변경은 이 파일만 수정하면 됩니다.
 * 좌표 단위는 "카드 PNG 원본 픽셀" 입니다. (현재 시안: 1024 x 1536)
 * ===================================================================== */

const CONFIG = {

  /* ---------------------------------------------------------------
   * 1) 카드 캔버스 크기
   *    실제 저장 크기는 카드 PNG 원본 크기를 자동으로 따릅니다.
   *    아래 width/height 는 좌표 기준값 (PNG 크기와 같게 두면 좌표가 그대로 적용)
   * --------------------------------------------------------------- */
  CARD: {
    width: 1024,
    height: 1536,
    useOverlaySize: true,
    exportType: "image/png",
    // 기본 사진 영역 (타입별 layout.photoArea 가 있으면 그 값을 사용)
    photoArea: { x: 270, y: 460, width: 485, height: 590 },
    backgroundColor: "#2b2342"
  },

  /* ---------------------------------------------------------------
   * 2) 닉네임 텍스트 — 사진 아래 가로 명패 안
   *    x, y : 글자 가운데 기준점 (y = 글자 세로 중앙)
   *    maxWidth : 넘치면 글자 크기를 자동으로 줄임 (minFontSize까지),
   *               그래도 넘치면 폭을 눌러서라도 maxWidth 안에 맞춤
   *    (타입별 layout.nickname 에 적은 값이 이 기본값을 덮어씀)
   * --------------------------------------------------------------- */
  NICKNAME: {
    x: 512,
    y: 1132,
    fontSize: 54,
    minFontSize: 24,
    fontWeight: "900",
    fontFamily: "'Noto Serif KR', 'Nanum Myeongjo', 'AppleMyungjo', 'Batang', serif",
    color: "#2a2238",
    align: "center",
    baseline: "middle",
    maxWidth: 460,
    letterSpacing: 2,
    maxLength: 14,
    uppercase: true
  },

  /* ---------------------------------------------------------------
   * 3) 학원명 텍스트 — 최상단 리본 안에 "둥글게"
   *    curve.enabled : true → 원호를 따라 글자를 배치
   *    curve.radius  : 원호 반지름(px). 작을수록 더 많이 휨, 0/false 면 직선
   *    x, y : 원호의 가장 높은 지점(가운데 글자)의 중심
   *    maxWidth : 원호를 따라 잰 글자 전체 길이 한도
   * --------------------------------------------------------------- */
  ACADEMY_NAME: {
    x: 512,
    y: 80,
    fontSize: 36,
    minFontSize: 16,
    fontWeight: "700",
    fontFamily: "'Noto Serif KR', 'Nanum Myeongjo', 'AppleMyungjo', 'Batang', serif",
    color: "#3a2d58",
    align: "center",
    baseline: "middle",
    maxWidth: 430,
    letterSpacing: 3,
    maxLength: 40,
    uppercase: false,
    curve: { enabled: true, radius: 1400 }
  },

  /* ---------------------------------------------------------------
   * 4) 카드 타입 6종
   *    name      : 결과 화면에 보이는 이름
   *    fileLabel : 저장 파일명에 들어가는 표기
   *    overlay   : 카드 PNG 경로 (사진 자리 투명)
   *    accent    : 앱 화면 포인트 색
   *    tagline   : 결과 화면 짧은 문구 (비워두면 표시 안 함)
   *    layout    : 시안마다 다른 위치값 (사진 영역, 닉네임 y, 학원명 y)
   * --------------------------------------------------------------- */
  CARD_TYPES: [
    {
      id: "type01", name: "PUMPKIN HACKER", fileLabel: "PUMPKIN_HACKER",
      overlay: "assets/card-01.png", accent: "#f0913a", tagline: "",
      layout: { photoArea: { x: 269, y: 467, width: 489, height: 589 }, nickname: { y: 1160 }, academyName: { y: 73 } }
    },
    {
      id: "type02", name: "GHOST GLITCHER", fileLabel: "GHOST_GLITCHER",
      overlay: "assets/card-02.png", accent: "#b9a2ee", tagline: "",
      layout: { photoArea: { x: 269, y: 428, width: 485, height: 608 }, nickname: { y: 1133 }, academyName: { y: 80 } }
    },
    {
      id: "type03", name: "MOON WOLF", fileLabel: "MOON_WOLF",
      overlay: "assets/card-03.png", accent: "#f1d27a", tagline: "",
      layout: { photoArea: { x: 263, y: 450, width: 498, height: 588 }, nickname: { y: 1123 }, academyName: { y: 80 } }
    },
    {
      id: "type04", name: "CANDY WIZARD", fileLabel: "CANDY_WIZARD",
      overlay: "assets/card-04.png", accent: "#f4a6c8", tagline: "",
      layout: { photoArea: { x: 277, y: 501, width: 471, height: 544 }, nickname: { y: 1131 }, academyName: { y: 79 } }
    },
    {
      id: "type05", name: "SHADOW EXPLORER", fileLabel: "SHADOW_EXPLORER",
      overlay: "assets/card-05.png", accent: "#a993e6", tagline: "",
      layout: { photoArea: { x: 264, y: 417, width: 495, height: 619 }, nickname: { y: 1133 }, academyName: { y: 79 } }
    },
    {
      id: "type06", name: "CLOWN TEDDY BEAR", fileLabel: "CLOWN_TEDDY_BEAR",
      overlay: "assets/card-06.png", accent: "#e8604f", tagline: "",
      layout: { photoArea: { x: 278, y: 487, width: 470, height: 554 }, nickname: { y: 1129 }, academyName: { y: 78 } }
    }
  ],

  /* ---------------------------------------------------------------
   * 5) 질문 4개 + 답변별 점수
   *    scores: { 카드타입id: 점수 } — 답변을 고르면 해당 타입에 점수가 더해짐
   *      type01 PUMPKIN HACKER   type02 GHOST GLITCHER   type03 MOON WOLF
   *      type04 CANDY WIZARD     type05 SHADOW EXPLORER  type06 CLOWN TEDDY BEAR
   *    최종 결과 = 가장 높은 점수의 타입
   *    동점이면: 동점 타입들(설정 순서) 중 (답변조합값 % 동점개수)번째를 선택
   *      답변조합값 = Σ (문항번호 × 답변번호)   ※ 둘 다 1부터
   *      → 같은 답변이면 항상 같은 결과 (랜덤 아님)
   *    현재 점수표로 81가지 모든 답변 조합을 계산하면
   *    PUMPKIN 13 / GHOST 13 / WOLF 15 / CANDY 13 / SHADOW 13 / TEDDY 14
   * --------------------------------------------------------------- */
  QUESTIONS: [
    {
      text: "할로윈 밤, 딱 하나만 챙길 수 있다면?",
      answers: [
        { label: "A", text: "🍭 왕 막대사탕",   scores: { type04: 2, type06: 1 } },
        { label: "B", text: "🏮 반짝이는 랜턴", scores: { type05: 2, type03: 1 } },
        { label: "C", text: "🎧 헤드폰",        scores: { type02: 2, type01: 1 } }
      ]
    },
    {
      text: "순간이동! 어디로 갈래?",
      answers: [
        { label: "A", text: "🎪 한밤의 서커스", scores: { type06: 2, type04: 1 } },
        { label: "B", text: "🌕 보름달 뜬 숲",  scores: { type03: 2, type02: 1 } },
        { label: "C", text: "🕹️ 비밀 게임방",   scores: { type01: 2, type02: 1 } }
      ]
    },
    {
      text: "친구들 사이에서 나는?",
      answers: [
        { label: "A", text: "😆 분위기 메이커", scores: { type06: 2, type04: 1 } },
        { label: "B", text: "💡 아이디어 뱅크", scores: { type01: 2, type05: 1 } },
        { label: "C", text: "🤫 조용한 관찰자", scores: { type03: 2, type05: 1 } }
      ]
    },
    {
      text: "할로윈 분장, 뭐로 할래?",
      answers: [
        { label: "A", text: "🧙 마법사", scores: { type04: 2, type01: 1 } },
        { label: "B", text: "👻 유령",   scores: { type02: 2, type06: 1 } },
        { label: "C", text: "🧭 탐험가", scores: { type05: 2, type03: 1 } }
      ]
    }
  ],

  /* ---------------------------------------------------------------
   * 6) 저장 / 인쇄
   * --------------------------------------------------------------- */
  SAVE: {
    // "download" : [이미지 저장] 누르면 바로 다운로드 폴더에 저장 (설정·허용 창 없음) ← 기본
    //              파일명: 학원명_Halloween_이름_닉네임_타입.png  /  인쇄 시 다운로드 폴더가 열림
    // "folder"   : 첫 저장 때 폴더를 한 번 고르면 그 안에 `${학원명}_Halloween_Cards` 폴더를 만들어 저장
    mode: "download",
    filePrefix: "Halloween",
    folderSuffix: "_Halloween_Cards",   // `${학원명}_Halloween_Cards`
    // 첫 저장 때 열리는 위치. "pictures"(사진 폴더)는 그대로 [폴더 선택]만 누르면 됨.
    // ※ 바탕화면·다운로드·문서 폴더 "자체"는 Chrome 보안 정책상 선택이 막혀 있어 쓰지 않음
    pickerStartIn: "pictures"
  },
  PRINT: {
    maxCards: 8,
    // A4 세로 1장에 2열 × 4행. 세로 카드는 가로로 눕혀서 칸에 딱 맞게 배치
    cardWidthMm: 66,    // 인쇄되는 카드 1장의 가로(눕히기 전) — 6.6cm
    cardHeightMm: 99,   // 인쇄되는 카드 1장의 세로(눕히기 전) — 9.9cm  (시안 비율 2:3)
    gapMm: 2,           // 카드 사이 간격
    rotate: "alternate", // "alternate" 왼쪽 열 ↻ / 오른쪽 열 ↺,  "cw" 모두 ↻,  "none" 회전 안 함
    accept: { "image/png": [".png"], "image/jpeg": [".jpg", ".jpeg"] }
  },

  /* ---------------------------------------------------------------
   * 7) 화면 문구
   * --------------------------------------------------------------- */
  TEXT: {
    eventLabel: "AFTER CLASS : 10.31",
    browserTip: "원활한 카드 저장 및 인쇄를 위해 PC/노트북의 Chrome 또는 Edge 브라우저 사용을 권장합니다.",
    fallbackSaveNotice: "현재 브라우저에서는 지정 폴더 자동 저장을 지원하지 않아 일반 다운로드 방식으로 저장됩니다. 전체 기능은 Chrome/Edge PC 환경을 권장합니다.",
    tooManyCards: "한 번에 최대 8장의 카드를 선택할 수 있습니다."
  }
};
