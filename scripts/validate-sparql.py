import json
from pathlib import Path
from rdflib import Graph

ROOT = Path(__file__).resolve().parents[1]
expected = json.loads((ROOT / "ontology/queries/expected.json").read_text())
graph = Graph().parse(ROOT / "dist/ontology/learning-map.ttl", format="turtle")
errors = []

query_files = sorted((ROOT / "ontology/queries").glob("*.rq"))
if len(query_files) != expected["queryCount"]:
    errors.append(f"query count {len(query_files)} != {expected['queryCount']}")

for path in query_files:
    result = graph.query(path.read_text())
    actual = bool(result) if result.type == "ASK" else sum(1 for _ in result)
    wanted = expected["results"].get(path.stem)
    if actual != wanted:
        errors.append(f"{path.stem}: {actual} != {wanted}")

if errors:
    raise SystemExit("SPARQL result validation failed:\n" + "\n".join(errors))

print(f"SPARQL result validation passed: {len(query_files)} queries over {len(graph)} triples")
