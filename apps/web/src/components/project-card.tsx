import { Link } from 'react-router';
import { ArrowUpLeft, GitBranch, Globe } from 'lucide-react';
import type { DemoProject } from '../demo/data';
import { persianNumber, useWorkspace } from '../lib/workspace';
import { PlatformMark } from './platform-mark';
import { DemoLabel, StatusBadge } from './primitives';
export function ProjectGlyph({ project }: { project: DemoProject }) {
  return <PlatformMark platform={project.framework} size={48} />;
}
export function HealthBars({ attention = false }: { attention?: boolean }) {
  return (
    <div
      className="health-bars"
      aria-label={
        attention ? 'در داده نمونه چند بررسی ناموفق وجود دارد' : 'بررسی‌های نمونه موفق‌اند'
      }
    >
      {Array.from({ length: 32 }, (_, index) => (
        <i key={index} className={attention && index > 26 && index < 31 ? 'bar-warning' : ''} />
      ))}
    </div>
  );
}
export function ProjectCard({ project }: { project: DemoProject }) {
  const { base } = useWorkspace();
  return (
    <Link to={`${base}/projects/${project.id}`} className="service-card">
      <div className="service-card-head">
        <ProjectGlyph project={project} />
        <div>
          <h3>
            <bdi>{project.name}</bdi>
          </h3>
          <p>{project.title}</p>
        </div>
        <ArrowUpLeft className="service-open" size={17} />
      </div>
      <div className="service-status">
        <StatusBadge status={project.status} />
        <DemoLabel compact />
      </div>
      <HealthBars attention={project.status === 'attention'} />
      <div className="service-stats">
        <span>
          زمان پاسخ{' '}
          <b>
            {persianNumber(project.latency)} <small>ms</small>
          </b>
        </span>
        <span>
          سلامت نمونه <b>{persianNumber(project.health, 2)}٪</b>
        </span>
      </div>
      <div className="service-card-foot">
        <span>
          <Globe size={13} />
          {project.region}
        </span>
        <span>
          <GitBranch size={13} />
          <bdi>{project.branch}</bdi>
        </span>
        <span>{project.framework}</span>
      </div>
    </Link>
  );
}
