import json
from pathlib import Path
from rdflib import Graph

ROOT = Path(__file__).resolve().parents[1]
expected = json.loads((ROOT / "ontology/queries/expected.json").read_text())
manifest = json.loads((ROOT / "dist/ontology/manifest.json").read_text())

# `bun run build:ontology` publishes middle+high+bridges; `--include-vocational` adds the separate
# specialised vocational ABox. Each mode has its own recorded result set.
graph_files = ["dist/ontology/learning-map.ttl"]
key = "results"
if manifest.get("includesVocational"):
    graph_files.append("dist/ontology/high-vocational.ttl")
    key = "resultsIncludingVocational"

graph = Graph()
for path in graph_files:
    graph.parse(ROOT / path, format="turtle")
errors = []

query_files = sorted((ROOT / "ontology/queries").glob("*.rq"))
if len(query_files) != expected["queryCount"]:
    errors.append(f"query count {len(query_files)} != {expected['queryCount']}")

for path in query_files:
    result = graph.query(path.read_text())
    actual = bool(result) if result.type == "ASK" else sum(1 for _ in result)
    wanted = expected[key].get(path.stem)
    if actual != wanted:
        errors.append(f"{path.stem}: {actual} != {wanted}")

if errors:
    raise SystemExit(f"SPARQL result validation failed ({key}):\n" + "\n".join(errors))

print(f"SPARQL result validation passed ({key}): {len(query_files)} queries over {len(graph)} triples")
