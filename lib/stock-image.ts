/** 등록 사진이 없는 가게에 붙일 대표 이미지를 고른다.
 *
 *  ★실제 그 가게 사진이 아니다★ — 메뉴를 짐작하게 하는 대표 이미지다.
 *  쓰는 쪽에서 그 사실을 반드시 화면에 적어야 한다. 안 적으면 "가보니 다르더라"가 된다.
 *
 *  업종(uptae)만 보면 너무 뭉뚱그려진다. 행안부 인허가 데이터의 업종은 '한식'이
 *  5만 곳, '기타'가 2만 곳이라 절반이 한 덩어리로 묶여버린다. 그래서 가게 이름을
 *  먼저 본다 — '원조 한우곱창'은 업종이 그냥 '한식'이지만 이름이 말해준다.
 *
 *  파일 규칙: public/stock/{키}-{1..6}.jpg — 코드를 안 고치고 사진만 갈아끼울 수 있다.
 */

/** 순서가 곧 우선순위다. 먼저 걸리면 아래는 안 본다 — 좁은 것부터 놓는다.
 *  '순대국'은 gukbap이고 '순대'는 bunsik인데, gukbap이 위에 있어야 순대국이 분식으로
 *  안 샌다. '장어구이'도 seafood가 gogi보다 위라서 고깃집 사진을 안 받는다.
 *
 *  짧은 토큰은 일부러 뺐다 — '바'는 바나나에, '회'는 회식·교회에, '식당'은 전부에
 *  걸린다. '커리'도 뺐다(베이'커리'가 카레집이 됐다). 오탐 하나가 엉뚱한 사진 하나다. */
const POOLS: [RegExp, string][] = [
  [/곱창|막창|대창/, "gopchang"],
  [/족발|보쌈/, "jokbal"],
  [/치킨|통닭|닭강정|후라이드|양념반|교촌|굽네|처갓집|bhc|BHC/, "chicken"],
  [/국밥|해장국|설렁탕|곰탕|삼계탕|추어탕|감자탕|뼈다귀|순대국|순댓국|해장/, "gukbap"],
  [/찌개|된장|순두부|두부/, "jjigae"],
  [/돈까스|돈카츠|돈가스|카츠|가츠/, "donkatsu"],
  [/초밥|스시|sushi|횟집|회집|사시미|참치|물회|생선회|모듬회|수산/, "sashimi"],
  [/해물|조개|낙지|문어|새우|대게|랍스터|장어|아구|해산물|해신탕/, "seafood"],
  [/삼겹|고깃집|숯불|화로|갈비|한우|불고기|정육|축산|생고기|목살|우삼겹|제육|구이/, "gogi"],
  [/쌀국수|베트남|태국|팟타이|인도커리|카레|반미|아시안|나시고랭/, "asian"],
  // 면을 한 풀에 묶었더니 칼국수집에 비빔냉면과 소바가 갔다. 뜨거운 국물면과
  // 찬 면은 사진이 전혀 다르다 — 갈라야 한다. 찬 면을 위에 둬야 '막국수'와
  // '콩국수'가 아래 '국수'에 먼저 걸리지 않는다.
  [/냉면|막국수|메밀|밀면|콩국수|소바|모밀/, "naengmyeon"],
  [/칼국수|국수|우동|수제비/, "kalguksu"],
  [/라멘|라면|돈부리|규동|덮밥/, "ramen"],
  [/이자카야|이자까야|사케|야키토리|오뎅바/, "izakaya"],
  [/마라|양꼬치|훠궈|짜장|짬뽕|탕수육|중화|중국|차이나|딤섬|만두/, "chinese"],
  [/피자|PIZZA|Pizza|pizza/, "pizza"],
  [/버거|맥도날드|롯데리아|맘스터치|BURGER|Burger|burger/, "burger"],
  [/파스타|스파게티|리조또|이탈리|PASTA|Pasta/, "pasta"],
  [/스테이크|steak|STEAK|Steak/, "steak"],
  [/브런치|샌드위치|샐러드|토스트|BRUNCH|Brunch/, "brunch"],
  [/분식|떡볶이|김밥|튀김|순대|어묵|핫도그|도시락/, "bunsik"],
  [/베이커리|제과|빵|파리바게|뚜레쥬르|도넛|케이크|디저트|타르트|크로플|와플/, "bakery"],
  [/카페|까페|커피|coffee|COFFEE|Coffee|cafe|CAFE|Cafe|스타벅스|투썸|이디야|메가커피|빽다방|컴포즈|더벤티|매머드|커피빈|할리스|탐앤탐스|파스쿠찌|다방/, "cafe"],
  [/호프|맥주|비어|생맥|펍|PUB|포차|포장마차|주점|술집|소주방|막걸리|와인|칵테일|대포집|정종|감성주점/, "pub"],
]

/** 이름도 업종도 위 표에 안 걸릴 때만 보는, 업종에만 쓰이는 표기.
 *  뭉뚱그린 말이라 맨 뒤에 둔다 — '일식'(7,370곳)은 초밥집일 수도 라멘집일 수도 있다. */
const CATEGORY_ONLY: [RegExp, string][] = [
  [/일식/, "sashimi"],
  [/경양식|양식/, "pasta"],        // 표본을 보니 돈까스·파스타·함박집이 섞여 있다
  [/패스트푸드/, "burger"],
  [/외국음식전문점/, "asian"],
]

/** 사진이 없어서 이웃 풀을 빌려 써야 하는 업종이 생기면 여기 적는다.
 *
 *  한때 곱창·족발이 여기 있었다. 무료 스톡(Pexels)에 한국 음식이 없어서 억지로
 *  검색 결과를 뒤지면 갈고리에 걸린 생고기나 꽃병이 나왔기 때문이다. 지금은
 *  24개 풀 전부 제 사진을 갖고 있어서 비어 있다.
 *
 *  매칭은 세분화한 채로 두고 사진만 빌리는 자리다 — 곱창집을 gogi로 '분류'해
 *  버리면 나중에 사진이 생겨도 되돌리기 어렵다. */
const PHOTO_ALIAS: Record<string, string> = {}

/** 아무 데도 안 걸리면 여기로. 전체의 40%쯤이 여기 온다(이름에 음식이 안 들어간
 *  가게가 그만큼 많다). 그래서 이 풀은 특정 메뉴가 아니라 '한상'에 가까워야 한다. */
const FALLBACK = "korean"
const PER_POOL = 6

/** 이름이 같으면 늘 같은 사진이 나온다 — 새로고침마다 사진이 바뀌면 이상하다.
 *
 *  h*31만 쓰면 6으로 나눌 때 쏠린다. 31 % 6 === 1 이라 자리 가중치가 통째로 사라지고
 *  '글자 코드의 합'만 남는데, 한글 음절은 0xAC00부터라 그 합이 고르게 안 퍼진다.
 *  12만 곳으로 재보니 1·3·5번이 18.6%, 2·4·6번이 14.8%로 갈렸다 — 카페 목록 상위
 *  세 곳이 전부 같은 사진을 뽑는 일이 실제로 생겼다.
 *
 *  그래서 나누기 전에 한 번 섞는다(murmur3 finalizer). 편차가 3.9%p → 0.5%p로 준다.
 *  Math.imul을 쓰는 이유는 0x85EBCA6B 곱이 32비트를 넘어가서 그냥 곱하면 정밀도가
 *  깨지기 때문이다. */
function hash(seed: string) {
  let h = 0
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return h >>> 0
}

/** 이름이 업종을 이긴다.
 *  '인카페(in cafe)'는 업종이 '호프/통닭'이다. 둘을 한 문자열로 합쳐서 훑으면
 *  chicken이 cafe보다 위라서 치킨 사진이 갔다. '세계맥주3도씨'도 같은 이유로
 *  치킨이 됐다. 이름은 주인이 붙인 말이고 업종은 인허가 분류일 뿐이라, 이름이 먼저다. */
export function stockKey(name: string, category?: string | null, mainCategory?: string | null) {
  for (let i = 0; i < POOLS.length; i += 1) if (POOLS[i][0].test(name)) return POOLS[i][1]
  const cat = category || ""
  if (cat) {
    for (let i = 0; i < POOLS.length; i += 1) if (POOLS[i][0].test(cat)) return POOLS[i][1]
    for (let i = 0; i < CATEGORY_ONLY.length; i += 1) {
      if (CATEGORY_ONLY[i][0].test(cat)) return CATEGORY_ONLY[i][1]
    }
  }
  // 이름에도 업종에도 단서가 없을 때의 마지막 힌트.
  // '그린하우스'는 이름이 말이 없고 업종이 '기타'라 한식으로 떨어져 반찬 사진이 갔는데,
  // 실은 카페였다. '기타'만 2만 곳이라 이 한 줄이 꽤 많은 카드를 바로잡는다.
  if (mainCategory === "CAFE") return "cafe"
  if (mainCategory === "PUB") return "pub"
  return FALLBACK
}

/** 후보를 순서대로 준다 — 사진(jpg) → 그림(svg) → 없음(색면).
 *  앞의 것이 404든 뭐든 실패하면 다음으로 조용히 내려간다. */
export function stockCandidates(name: string, category?: string | null, mainCategory?: string | null) {
  const key = stockKey(name, category, mainCategory)
  const pool = PHOTO_ALIAS[key] || key
  const n = (hash(name) % PER_POOL) + 1
  return [`/stock/${pool}-${n}.jpg`, `/stock/${pool}-${n}.svg`]
}
