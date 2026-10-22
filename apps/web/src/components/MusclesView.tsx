import type { Muscle } from '@spotter/shared';

interface MusclesViewProps {
  muscles: Muscle[];
}

export function MusclesView({ muscles }: MusclesViewProps) {
  const groups = groupMuscles(muscles);

  return (
    <section className="page-section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">BUILT-IN REFERENCE</span>
          <h2>Muscles</h2>
        </div>
      </div>
      <div className="muscle-directory">
        {groups.map(([group, entries]) => (
          <section className="muscle-directory-group" key={group}>
            <h3 className="muscle-tree-parent">{group}</h3>
            <ul className="muscle-tree-children">
              {muscleTree(entries).map((node) =>
                node.kind === 'muscle' ? (
                  <MuscleLeaf
                    level={2}
                    muscle={node.muscle}
                    key={node.muscle.id}
                  />
                ) : (
                  <li className="muscle-tree-branch" key={node.name}>
                    <span>{node.name}</span>
                    <ul>
                      {node.muscles.map((muscle) => (
                        <MuscleLeaf level={3} muscle={muscle} key={muscle.id} />
                      ))}
                    </ul>
                  </li>
                ),
              )}
            </ul>
          </section>
        ))}
      </div>
    </section>
  );
}

function MuscleLeaf({ muscle, level }: { muscle: Muscle; level: 2 | 3 }) {
  return (
    <li className={`muscle-tree-leaf muscle-tree-level-${level}`}>
      <a
        href={muscle.referenceUrl ?? undefined}
        target="_blank"
        rel="noreferrer"
      >
        {muscle.name}
        <span aria-hidden="true">↗</span>
      </a>
    </li>
  );
}

function groupMuscles(muscles: Muscle[]) {
  const groups = new Map<string, Muscle[]>();
  for (const muscle of muscles) {
    const entries = groups.get(muscle.group) ?? [];
    entries.push(muscle);
    groups.set(muscle.group, entries);
  }
  return [...groups.entries()];
}

type MuscleTreeNode =
  | { kind: 'muscle'; muscle: Muscle }
  | { kind: 'subgroup'; name: string; muscles: Muscle[] };

function muscleTree(muscles: Muscle[]): MuscleTreeNode[] {
  const nodes: MuscleTreeNode[] = [];
  const subgroups = new Map<string, Muscle[]>();
  for (const muscle of muscles) {
    if (!muscle.subgroup) {
      nodes.push({ kind: 'muscle', muscle });
      continue;
    }
    const subgroup = subgroups.get(muscle.subgroup);
    if (subgroup) {
      subgroup.push(muscle);
      continue;
    }
    const entries = [muscle];
    subgroups.set(muscle.subgroup, entries);
    nodes.push({ kind: 'subgroup', name: muscle.subgroup, muscles: entries });
  }
  return nodes;
}
