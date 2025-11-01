export const runtime = 'edge';

import { ImageResponse } from 'next/og';

export const size = {
  width: 96,
  height: 96,
};

export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          height: '100%',
          width: '100%',
          background: 'radial-gradient(circle at 30% 30%, #a855f7 0%, #312e81 55%, #020617 100%)',
          borderRadius: '28%',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            position: 'absolute',
            width: '72%',
            height: '72%',
            borderRadius: '26%',
            background: 'linear-gradient(135deg, rgba(168,85,247,0.8), rgba(34,211,238,0.75))',
            filter: 'blur(12px)',
            opacity: 0.85,
          }}
        />
        <div
          style={{
            position: 'relative',
            display: 'flex',
            width: '56%',
            height: '56%',
            borderRadius: '20%',
            background: 'rgba(15,23,42,0.92)',
            border: '3px solid rgba(226,232,240,0.2)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              position: 'absolute',
              width: '16%',
              height: '46%',
              borderRadius: '999px',
              background: 'linear-gradient(180deg, #f4f3ff, #c7d2fe)',
              opacity: 0.95,
              left: '26%',
            }}
          />
          <div
            style={{
              position: 'absolute',
              width: '16%',
              height: '68%',
              borderRadius: '999px',
              background: 'linear-gradient(180deg, #f4f3ff, #c7d2fe)',
              opacity: 0.95,
            }}
          />
          <div
            style={{
              position: 'absolute',
              width: '16%',
              height: '54%',
              borderRadius: '999px',
              background: 'linear-gradient(180deg, rgba(226,232,240,0.9), rgba(165,243,252,0.8))',
              right: '26%',
            }}
          />
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}

