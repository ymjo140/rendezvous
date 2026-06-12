import Link from "next/link"

export const metadata = { title: "개인정보처리방침 - 랑데부" }

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: "1. 수집하는 개인정보 항목",
    body: [
      "· 회원가입(카카오 연동): 카카오 계정 식별자, 닉네임",
      "· 서비스 이용: 설정한 동네(위치), 취향 정보(선호 음식·분위기·예산), 예약 내역, 캐시 충전·사용 내역, 게시물·댓글·리뷰, 친구 관계",
      "· 자동 수집: 서비스 이용 기록(노출·클릭 등 행동 로그), 접속 일시",
    ],
  },
  {
    title: "2. 개인정보의 이용 목적",
    body: [
      "· 회원 식별 및 서비스 제공(취향 기반 추천, 예약, 핫딜, 커뮤니티)",
      "· 추천 품질 개선을 위한 취향 학습(행동 로그 기반 개인화)",
      "· 예약금 결제·환불 처리 및 거래 기록 관리",
      "· 부정 이용 방지 및 고객 문의 대응",
    ],
  },
  {
    title: "3. 보유 및 이용 기간",
    body: [
      "· 회원 탈퇴 시 개인정보는 지체 없이 파기 또는 익명화합니다.",
      "· 단, 전자상거래 등 관련 법령에 따라 거래 기록(결제·환불)은 법정 기간(5년) 동안 익명화된 형태로 보존될 수 있습니다.",
    ],
  },
  {
    title: "4. 개인정보의 제3자 제공",
    body: [
      "· 회사는 이용자의 동의 없이 개인정보를 제3자에게 제공하지 않습니다.",
      "· 예약 처리를 위해 예약 일시·인원 정보가 해당 매장(사장님)에게 제공됩니다(이름·연락처 등 식별 정보 제외).",
    ],
  },
  {
    title: "5. 처리 위탁",
    body: [
      "· 데이터 보관: Supabase Inc. (데이터베이스 호스팅)",
      "· 서버 운영: Render Services, Inc. / Vercel Inc.",
      "· 로그인 연동: 카카오(주)",
    ],
  },
  {
    title: "6. 이용자의 권리",
    body: [
      "· 이용자는 언제든지 마이페이지에서 개인정보(취향·동네 등)를 조회·수정할 수 있습니다.",
      "· 마이페이지의 회원 탈퇴 기능으로 계정 및 개인 콘텐츠(게시물·댓글·친구·학습 데이터) 삭제를 요청할 수 있으며 즉시 처리됩니다.",
      "· 게시물 신고 및 사용자 차단 기능을 제공합니다.",
    ],
  },
  {
    title: "7. 개인정보 보호책임자",
    body: [
      "· 책임자: 랑데부 운영팀",
      "· 문의: contact@rendezvous.app",
    ],
  },
  {
    title: "부칙",
    body: ["이 방침은 2026년 6월 1일부터 적용됩니다."],
  },
]

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-gray-50 font-['Pretendard']">
      <div className="mx-auto max-w-2xl px-5 py-8">
        <Link href="/" className="text-sm text-gray-400">← 돌아가기</Link>
        <h1 className="mt-3 text-2xl font-bold text-gray-900">개인정보처리방침</h1>
        <div className="mt-6 space-y-6 rounded-2xl border border-gray-100 bg-white p-6">
          {SECTIONS.map((s) => (
            <section key={s.title}>
              <h2 className="text-sm font-bold text-gray-800">{s.title}</h2>
              {s.body.map((line, i) => (
                <p key={i} className="mt-1.5 text-sm leading-relaxed text-gray-600">{line}</p>
              ))}
            </section>
          ))}
        </div>
      </div>
    </main>
  )
}
