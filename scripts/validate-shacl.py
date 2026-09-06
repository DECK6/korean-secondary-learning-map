from pathlib import Path
from rdflib import Graph
from pyshacl import validate

ROOT = Path(__file__).resolve().parents[1]


def graph(*paths: str) -> Graph:
    result = Graph()
    for path in paths:
        result.parse(ROOT / path, format="turtle")
    return result


ontology = graph("ontology/learning-map.ttl", "ontology/k12-core.ttl", "ontology/metadata.ttl")
shapes = graph("ontology/shapes.ttl")
positive = graph("ontology/fixtures/canonical-positive.ttl")
adversarial = graph("ontology/fixtures/adversarial/all.ttl")

positive_conforms, _, positive_report = validate(
    positive,
    shacl_graph=shapes,
    ont_graph=ontology,
    advanced=True,
    inference="rdfs",
)
if not positive_conforms:
    raise SystemExit(f"positive SHACL fixture failed:\n{positive_report}")

adversarial_conforms, _, adversarial_report = validate(
    adversarial,
    shacl_graph=shapes,
    ont_graph=ontology,
    advanced=True,
    inference="rdfs",
)
if adversarial_conforms:
    raise SystemExit("adversarial SHACL fixture unexpectedly conformed")

# The published ABox files are validated together: a vocational relation may name an academic
# prerequisite, so the shapes need both graphs whenever the vocational file was built.
import json

manifest = json.loads((ROOT / "dist/ontology/manifest.json").read_text())
abox_files = ["dist/ontology/learning-map.ttl"]
if manifest.get("includesVocational"):
    abox_files.append("dist/ontology/high-vocational.ttl")
full_abox = graph(*abox_files)
full_conforms, _, full_report = validate(
    full_abox,
    shacl_graph=shapes,
    ont_graph=ontology,
    advanced=True,
    inference=None,
)
if not full_conforms:
    raise SystemExit(f"full ABox SHACL validation failed:\n{full_report}")

print(f"SHACL Advanced validation passed: positive conforms, adversarial rejected, {'+'.join(abox_files)} conforms ({len(full_abox)} triples)")
