import Link from "next/link"

export const metadata = { title: "이용약관 - 랑데부" }

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: "제1조 (목적)",
    body: [
      "이 약관은 랑데부(이하 \"회사\")가 제공하는 장소 추천·예약·커뮤니티 서비스(이하 \"서비스\")의 이용 조건 및 절차, 회사와 이용자의 권리·의무 및 책임사항을 규정함을 목적으로 합니다.",
    ],
  },
  {
    title: "제2조 (정의)",
    body: [
      "1. \"서비스\"란 회사가 제공하는 취향 기반 장소 추천, 모임 중간지점 찾기, 예약 및 예약금 결제, 핫딜, 게시물 등 일체의 기능을 말합니다.",
      "2. \"이용자\"란 이 약관에 따라 서비스를 이용하는 회원 및 비회원을 말합니다.",
      "3. \"캐시\"란 서비스 내 예약금 결제에 사용할 수 있는 선불 충전 수단을 말합니다.",
    ],
  },
  {
    title: "제3조 (약관의 효력 및 변경)",
    body: [
      "1. 이 약관은 서비스 화면에 게시하거나 기타 방법으로 공지함으로써 효력이 발생합니다.",
      "2. 회사는 관련 법령을 위배하지 않는 범위에서 약관을 개정할 수 있으며, 개정 시 적용일자 및 사유를 명시하여 사전 공지합니다.",
    ],
  },
  {
    title: "제4조 (회원가입 및 탈퇴)",
    body: [
      "1. 회원가입은 카카오 계정 연동 등 회사가 정한 방법으로 신청하고 회사가 승낙함으로써 성립합니다.",
      "2. 회원은 언제든지 마이페이지의 회원 탈퇴 기능을 통해 탈퇴할 수 있으며, 탈퇴 시 개인정보는 개인정보처리방침에 따라 지체 없이 파기 또는 익명화됩니다.",
    ],
  },
  {
    title: "제5조 (캐시 및 예약금)",
    body: [
      "1. 캐시는 예약금 결제에 사용되며, 예약 취소 시 예약금은 캐시로 환불됩니다.",
      "2. 충전 보너스 등 회사가 무상으로 지급한 캐시는 환급 대상에서 제외될 수 있습니다.",
      "3. 캐시의 충전·사용·환불에 관한 세부 사항은 서비스 내 안내에 따릅니다.",
    ],
  },
  {
    title: "제6조 (게시물 및 금지행위)",
    body: [
      "1. 이용자가 작성한 게시물의 권리와 책임은 작성자에게 있습니다.",
      "2. 타인의 권리 침해, 음란·혐오·스팸성 게시물, 허위 정보 유포 등은 금지되며, 회사는 신고 접수 또는 자체 모니터링을 통해 사전 통지 없이 해당 게시물을 삭제하거나 이용을 제한할 수 있습니다.",
      "3. 이용자는 게시물 신고 및 사용자 차단 기능을 통해 부적절한 콘텐츠를 신고할 수 있으며, 회사는 24시간 이내 검토를 원칙으로 합니다.",
    ],
  },
  {
    title: "제7조 (서비스의 변경 및 중단)",
    body: [
      "회사는 운영상·기술상 필요에 따라 서비스의 전부 또는 일부를 변경하거나 중단할 수 있으며, 중요한 변경은 사전에 공지합니다.",
    ],
  },
  {
    title: "제8조 (면책)",
    body: [
      "1. 회사는 천재지변, 통신 장애 등 불가항력으로 인한 서비스 중단에 대해 책임을 지지 않습니다.",
      "2. 장소 정보(영업시간, 가격 등)는 제휴 매장 및 공개 데이터를 기반으로 하며 실제와 다를 수 있습니다.",
    ],
  },
  {
    title: "부칙",
    body: ["이 약관은 2026년 6월 1일부터 적용됩니다."],
  },
]

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-gray-50 font-['Pretendard']">
      <div className="mx-auto max-w-2xl px-5 py-8">
        <Link href="/" className="text-sm text-gray-400">← 돌아가기</Link>
        <h1 className="mt-3 text-2xl font-bold text-gray-900">이용약관</h1>
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
        <p className="mt-4 text-xs text-gray-400">문의: contact@rendezvous.app</p>
      </div>
    </main>
  )
}
