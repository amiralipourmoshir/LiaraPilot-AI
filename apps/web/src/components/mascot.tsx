import { motion, useReducedMotion } from 'motion/react';
export function Mascot({
  size = 44,
  full = false,
  animate = false,
  label,
  className = '',
}: {
  size?: number;
  full?: boolean;
  animate?: boolean;
  label?: string;
  className?: string;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.span
      className={`pilot-pet ${full ? 'pet-full' : 'pet-avatar'} ${className}`}
      style={{ width: size, height: size }}
      animate={animate && !reduced ? { y: [0, -7, 0] } : { y: 0 }}
      transition={{ duration: 5, repeat: animate && !reduced ? Infinity : 0, ease: 'easeInOut' }}
    >
      <img
        src={full ? '/brand/pilot-mascot.png' : '/brand/pilot-head.png'}
        alt={label ?? ''}
        aria-hidden={!label}
        width="1254"
        height="1254"
        decoding="async"
        draggable={false}
      />
    </motion.span>
  );
}
