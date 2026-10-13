import { roadmap, type RoadmapItem } from '@site/src/data/roadmap';
import Link from '@docusaurus/Link';
import clsx from 'clsx';
import styles from './Roadmap.module.css';

const REPO = 'https://code.futo.org/harbor/harbor';

const formatDate = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });

function Ref({ item }: { item: RoadmapItem }) {
  if (item.version) {
    return (
      <a className={styles.ref} href={`${REPO}/releases/tag/${item.version}`}>
        {item.version}
      </a>
    );
  }
  if (item.commit) {
    return (
      <a className={styles.ref} href={`${REPO}/commit/${item.commit}`}>
        {item.commit.slice(0, 9)}
      </a>
    );
  }
  return null;
}

export function Roadmap() {
  return (
    <ol className={styles.roadmap}>
      {roadmap.map((entry) => {
        if ('phase' in entry) {
          return (
            <li key={entry.phase} className={styles.phase}>
              <span className={styles.phaseLabel}>{entry.phase}</span>
            </li>
          );
        }
        if ('gap' in entry) {
          return (
            <li key={entry.gap} className={styles.gap}>
              <span className={styles.date}>{entry.when}</span>
              <span className={styles.dot} aria-hidden />
              <div className={styles.card}>
                <span className={styles.title}>{entry.gap}</span>
                <p className={styles.description}>{entry.description}</p>
              </div>
            </li>
          );
        }
        return (
          <li
            key={`${entry.title}-${entry.date ?? 'soon'}`}
            className={clsx(
              styles.item,
              !entry.date && styles.planned,
              entry.milestone && styles.milestone,
            )}
          >
            <span className={styles.date}>
              {entry.date ? formatDate(entry.date) : (entry.when ?? 'Soon')}
            </span>
            <span className={styles.dot} aria-hidden />
            <div className={styles.card}>
              <div className={styles.header}>
                <span className={styles.title}>{entry.title}</span>
                <Ref item={entry} />
              </div>
              <p className={styles.description}>
                {entry.description}
                {entry.link && (
                  <>
                    {' '}
                    <Link className={styles.link} to={entry.link.to}>
                      {entry.link.label}
                      <svg width="13.5" height="13.5" aria-hidden>
                        <use href="#theme-svg-external-link" />
                      </svg>
                    </Link>
                  </>
                )}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
