import Link from "next/link"

export const metadata = { title: "위치기반서비스 이용약관 - 랑데부" }

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: "제1조 (목적)",
    body: [
      "이 약관은 랑데부(이하 \"회사\")가 제공하는 위치기반서비스에 대해 회사와 개인위치정보주체(이용자) 간의 권리·의무 및 책임사항, 기타 필요한 사항을 규정함을 목적으로 합니다.",
    ],
  },
  {
    title: "제2조 (서비스의 내용)",
    body: [
      "회사는 이용자의 개인위치정보를 이용하여 다음의 위치기반서비스를 제공합니다.",
      "· 내 주변 및 설정 동네 기반 장소 추천",
      "· 모임 참여자의 위치를 이용한 중간지점 찾기 및 장소 추천",
      "· 위치 기반 핫딜·빈자리 등 실시간 정보 제공",
    ],
  },
  {
    title: "제3조 (개인위치정보의 수집·이용·제공)",
    body: [
      "1. 회사는 위치기반서비스 제공을 위해 필요한 범위에서 개인위치정보를 수집·이용합니다.",
      "2. 회사는 이용자의 사전 동의 없이 개인위치정보를 제3자에게 제공하지 않습니다. 다만 이용자가 지정한 모임 구성원에게 중간지점 계산 결과 등 서비스 제공에 필요한 범위의 정보가 제공될 수 있습니다.",
      "3. 개인위치정보는 서비스 제공 목적 달성 후 지체 없이 파기합니다. 다만 위치정보의 보호 및 이용 등에 관한 법률 제16조에 따라 위치정보 수집·이용·제공 사실 확인자료는 6개월 이상 보관합니다.",
    ],
  },
  {
    title: "제4조 (개인위치정보의 보유 목적 및 이용 기간)",
    body: [
      "· 이용 목적: 위치기반 장소 추천, 중간지점 찾기, 주변 정보 제공",
      "· 보유 기간: 회원 탈퇴 또는 동의 철회 시까지. 수집·이용·제공 사실 확인자료는 관계 법령에 따라 6개월 보관.",
    ],
  },
  {
    title: "제5조 (개인위치정보주체의 권리)",
    body: [
      "1. 이용자는 개인위치정보 수집·이용·제공에 대한 동의의 전부 또는 일부를 언제든지 철회할 수 있습니다. 동의 철회는 앱 내 위치 권한 해제 또는 회원 탈퇴로 할 수 있습니다.",
      "2. 이용자는 개인위치정보의 수집·이용·제공 사실 확인자료의 열람·고지를 회사에 요구할 수 있으며, 오류가 있는 경우 정정을 요구할 수 있습니다.",
      "3. 동의를 철회한 경우 회사는 지체 없이 수집된 개인위치정보 및 확인자료(단, 법령상 보관 의무가 있는 경우 제외)를 파기합니다.",
    ],
  },
  {
    title: "제6조 (법정대리인의 권리)",
    body: [
      "회사는 만 14세 미만 아동의 개인위치정보를 수집·이용·제공하고자 하는 경우 법정대리인의 동의를 받습니다. 랑데부는 만 14세 미만의 가입을 제한합니다.",
    ],
  },
  {
    title: "제7조 (위치정보 보호책임자)",
    body: [
      "· 책임자: 랑데부 운영팀",
      "· 문의: contact@rendezvous.app",
    ],
  },
  {
    title: "제8조 (손해배상 및 면책)",
    body: [
      "회사가 위치정보의 보호 및 이용 등에 관한 법률을 위반하여 이용자에게 손해가 발생한 경우 이용자는 손해배상을 청구할 수 있습니다. 다만 천재지변, 통신 장애 등 불가항력 또는 이용자의 고의·과실로 인한 경우 회사는 책임을 지지 않습니다.",
    ],
  },
  {
    title: "부칙",
    body: ["이 약관은 2026년 7월 2일부터 적용됩니다."],
  },
]

export default function LocationTermsPage() {
  return (
    <main className="min-h-screen bg-gray-50 font-['Pretendard']">
      <div className="mx-auto max-w-2xl px-5 py-8">
        <Link href="/" className="text-sm text-gray-400">← 돌아가기</Link>
        <h1 className="mt-3 text-2xl font-bold text-gray-900">위치기반서비스 이용약관</h1>
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
