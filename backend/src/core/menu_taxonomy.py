# -*- coding: utf-8 -*-
"""메뉴 분류 — 가게를 '무슨 음식을 파는 곳'으로 나눈다.

프론트의 lib/stock-image.ts와 **같은 정규식·같은 순서**여야 한다. 한쪽만 고치면
같은 가게가 화면마다 다른 메뉴로 잡힌다. tests/test_menu_taxonomy.py가 두 파일을
비교해서 어긋나면 실패한다.

왜 cuisine_type을 안 쓰나
  DB의 cuisine_type은 '한식'이 46,541곳(37%)이다. 국밥집·삼겹살집·칼국수집이 전부
  한 덩어리라 취향 축으로 못 쓴다. 이름을 먼저 보면 그중 30%가 갈라진다.

왜 이름이 업종을 이기나
  '인카페(in cafe)'는 업종이 '호프/통닭'이다. 업종은 인허가 분류일 뿐이고 이름은
  주인이 붙인 말이라 이름이 더 정확하다.

개수 근거(2026-08-02 조사)
  쿠팡이츠 23개, 요기요 18개, 배민 ~16개. 우리 25개는 그 범위 상단이라 적정하다.
  세 곳 모두 가게당 최대 3개까지만 붙인다 — taste_service.MAX_FACETS=3과 같다.
"""
import re
from typing import List, Optional, Tuple

# 순서가 곧 우선순위다. 먼저 걸리면 아래는 안 본다 — 좁은 것부터.
# 짧은 토큰은 뺐다: '바'는 바나나에, '회'는 회식에, '커리'는 베이커리에 걸린다.
POOLS: List[Tuple[re.Pattern, str]] = [(re.compile(p), k) for p, k in [
    (r"곱창|막창|대창", "gopchang"),
    (r"족발|보쌈", "jokbal"),
    (r"치킨|통닭|닭강정|후라이드|양념반|교촌|굽네|처갓집|bhc|BHC", "chicken"),
    (r"국밥|해장국|설렁탕|곰탕|삼계탕|추어탕|감자탕|뼈다귀|순대국|순댓국|해장", "gukbap"),
    (r"찌개|된장|순두부|두부", "jjigae"),
    (r"돈까스|돈카츠|돈가스|카츠|가츠", "donkatsu"),
    (r"초밥|스시|sushi|횟집|회집|사시미|참치|물회|생선회|모듬회|수산", "sashimi"),
    (r"해물|조개|낙지|문어|새우|대게|랍스터|장어|아구|해산물|해신탕", "seafood"),
    (r"삼겹|고깃집|숯불|화로|갈비|한우|불고기|정육|축산|생고기|목살|우삼겹|제육|구이", "gogi"),
    (r"쌀국수|베트남|태국|팟타이|인도커리|카레|반미|아시안|나시고랭", "asian"),
    (r"냉면|막국수|메밀|밀면|콩국수|소바|모밀", "naengmyeon"),
    (r"칼국수|국수|우동|수제비", "kalguksu"),
    (r"라멘|라면|돈부리|규동|덮밥", "ramen"),
    (r"이자카야|이자까야|사케|야키토리|오뎅바", "izakaya"),
    (r"마라|양꼬치|훠궈|짜장|짬뽕|탕수육|중화|중국|차이나|딤섬|만두", "chinese"),
    (r"피자|PIZZA|Pizza|pizza", "pizza"),
    (r"버거|맥도날드|롯데리아|맘스터치|BURGER|Burger|burger", "burger"),
    (r"파스타|스파게티|리조또|이탈리|PASTA|Pasta", "pasta"),
    (r"스테이크|steak|STEAK|Steak", "steak"),
    (r"브런치|샌드위치|샐러드|토스트|BRUNCH|Brunch", "brunch"),
    (r"분식|떡볶이|김밥|튀김|순대|어묵|핫도그|도시락", "bunsik"),
    (r"베이커리|제과|빵|파리바게|뚜레쥬르|도넛|케이크|디저트|타르트|크로플|와플", "bakery"),
    (r"카페|까페|커피|coffee|COFFEE|Coffee|cafe|CAFE|Cafe|스타벅스|투썸|이디야|메가커피|빽다방|컴포즈|더벤티|매머드|커피빈|할리스|탐앤탐스|파스쿠찌|다방", "cafe"),
    (r"호프|맥주|비어|생맥|펍|PUB|포차|포장마차|주점|술집|소주방|막걸리|와인|칵테일|대포집|정종|감성주점", "pub"),
]]

# 이름도 업종도 위 표에 안 걸릴 때만 보는, 업종에만 쓰이는 뭉뚱그린 표기
CATEGORY_ONLY: List[Tuple[re.Pattern, str]] = [(re.compile(p), k) for p, k in [
    (r"일식", "sashimi"),
    (r"경양식|양식", "pasta"),
    (r"패스트푸드", "burger"),
    (r"외국음식전문점", "asian"),
]]

FALLBACK = "korean"


def menu_key(name: str, category: Optional[str] = None,
             main_category: Optional[str] = None) -> str:
    """이름 → 업종 → main_category → 기본값 순으로 본다."""
    for rx, key in POOLS:
        if rx.search(name or ""):
            return key
    cat = category or ""
    if cat:
        for rx, key in POOLS:
            if rx.search(cat):
                return key
        for rx, key in CATEGORY_ONLY:
            if rx.search(cat):
                return key
    if main_category == "CAFE":
        return "cafe"
    if main_category == "PUB":
        return "pub"
    return FALLBACK


# ── 온보딩 화면에 쓰는 표시용 정보 ──────────────────────────────
# group은 1단(대분류), title은 2단(메뉴 카드). 사진은 public/stock/{key}-{n}.jpg.
#
# 상황(회식·데이트·혼밥)은 여기 섞지 않는다. 배민도 '도시락·야식'을 "음식 카테고리가
# 아닌 가게의 특성"이라고 따로 뒀다. 목적을 취향 축에 섞으면 덩어리가 오염된다.
MENU_CARDS: List[dict] = [
    {"key": "korean",     "group": "한식",      "title": "백반·집밥"},
    {"key": "gukbap",     "group": "한식",      "title": "국밥·탕"},
    {"key": "gogi",       "group": "한식",      "title": "고기구이"},
    {"key": "jokbal",     "group": "한식",      "title": "족발·보쌈"},
    {"key": "jjigae",     "group": "한식",      "title": "찌개·전골"},
    {"key": "gopchang",   "group": "한식",      "title": "곱창·막창"},
    {"key": "kalguksu",   "group": "한식",      "title": "칼국수·국수"},
    {"key": "naengmyeon", "group": "한식",      "title": "냉면·막국수"},
    {"key": "bunsik",     "group": "한식",      "title": "분식·떡볶이"},
    {"key": "seafood",    "group": "한식",      "title": "해산물·조개"},
    {"key": "sashimi",    "group": "일식",      "title": "초밥·회"},
    {"key": "donkatsu",   "group": "일식",      "title": "돈까스"},
    {"key": "ramen",      "group": "일식",      "title": "라멘·덮밥"},
    {"key": "izakaya",    "group": "일식",      "title": "이자카야"},
    {"key": "chinese",    "group": "중식",      "title": "중식"},
    {"key": "pasta",      "group": "양식",      "title": "파스타·리조또"},
    {"key": "pizza",      "group": "양식",      "title": "피자"},
    {"key": "burger",     "group": "양식",      "title": "버거"},
    {"key": "steak",      "group": "양식",      "title": "스테이크"},
    {"key": "brunch",     "group": "양식",      "title": "브런치·샐러드"},
    {"key": "asian",      "group": "아시안",    "title": "아시안"},
    {"key": "cafe",       "group": "카페·디저트", "title": "카페"},
    {"key": "bakery",     "group": "카페·디저트", "title": "베이커리·디저트"},
    {"key": "pub",        "group": "술",        "title": "술집·포차"},
    {"key": "chicken",    "group": "술",        "title": "치킨"},
]

GROUP_ORDER = ["한식", "일식", "중식", "양식", "아시안", "카페·디저트", "술"]

_TITLE = {c["key"]: c["title"] for c in MENU_CARDS}


def menu_title(key: str) -> str:
    """덩어리 라벨로 쓸 한글 이름. 추천 이유 문장에 그대로 들어간다."""
    return _TITLE.get(key, key)
