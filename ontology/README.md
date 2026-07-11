# 형식 온톨로지

`learning-map.ttl`은 중등 확장 TBox, `context.jsonld`는 JSON-LD context, `shapes.ttl`은 핵심 SHACL 제약이다. `queries`에는 SCQ-01~20 SPARQL, `fixtures`에는 양성 그래프와 10개 실패 유형의 적대 그래프가 있다.

`bun run build:ontology`는 정규화 JSON에서 결정적 ABox를 `dist/ontology/learning-map.{jsonld,ttl}`로 만든다. `bun run validate:ontology`는 166,880개 노드·1,798,025개 트리플의 JSON-LD↔Turtle 전체 동형성, bounded RDFS/OWL-RL subset과 적대 fixture 탐지를 검증한다. 이때 `CourseRelation`이 `TransitionAlignment`로 잘못 추론되지 않는지도 회귀 검사한다. `bun run validate:shacl`은 PySHACL Advanced로 양성 fixture 통과, 적대 fixture 거절, 전체 ABox 적합성을 확인한다. `bun run validate:sparql`은 SCQ-01~20을 전체 ABox에서 실제 실행해 고정된 예상 결과와 비교한다.

형식 통과는 내용 전문가 승인이나 권리 해제를 뜻하지 않는다. 공식 성취기준은 locator가 필수이고, 기계적 요약·세부 주제·전이·과목 관계·경로는 후보 상태를 유지한다. 주제 선수 관계는 근거 없는 자동 생성 대신 현재 0건으로 둔다.
