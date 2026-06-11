import React, { useRef } from 'react';
import ReactPlayer from 'react-player';

const styles = {
  galleryContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    marginBottom: '40px'
  },
  mainMediaDisplay: {
    width: '100%',
    aspectRatio: '16 / 9',
    backgroundColor: '#000',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: '4px',
    overflow: 'hidden',
    border: '1px solid var(--border)',
    position: 'relative'
  },
  mediaStrip: {
    display: 'flex',
    gap: '8px',
    overflowX: 'auto',
    paddingBottom: '10px'
  },
  thumbItem: {
    width: '120px',
    height: '68px',
    borderRadius: '2px',
    cursor: 'pointer',
    objectFit: 'cover',
    border: '2px solid transparent',
    opacity: 0.6
  },
  thumbItemActive: {
    border: '2px solid #E50914',
    opacity: 1
  },
  playButtonOverlay: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    fontSize: '60px',
    color: 'rgba(255,255,255,0.8)',
    cursor: 'pointer',
    zIndex: 10
  }
};

export default function GameGallery({ selectedMedia, setSelectedMedia, mediaList, isPlaying, setIsPlaying }) {
  const videoRef = useRef(null);

  const handlePlayVideo = () => {
    setIsPlaying(true);
  };

  return (
    <div style={styles.galleryContainer}>
      <div style={styles.mainMediaDisplay}>
        {selectedMedia?.type === 'video' ? (
          <>
            {isPlaying ? (
              <video
                src={selectedMedia.url}
                autoPlay
                controls
                style={{ width: '100%', height: '100%', objectFit: 'contain', outline: 'none' }}
              />
            ) : (
              <>
                <img
                  src={selectedMedia.thumb}
                  alt="Poster"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.7 }}
                />
                <div style={styles.playButtonOverlay} onClick={handlePlayVideo}>▶</div>
              </>
            )}
          </>
        ) : (
          <img
            src={selectedMedia?.url}
            alt="Main"
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
        )}
      </div>

      <div style={styles.mediaStrip}>
        {mediaList.map((item, idx) => (
          <div
            key={idx}
            style={{ position: 'relative', flexShrink: 0 }}
            onClick={() => {
              setSelectedMedia(item);
              setIsPlaying(false);
            }}
          >
            <img
              src={item.thumb}
              alt="thumb"
              style={{
                ...styles.thumbItem,
                ...(selectedMedia?.url === item.url ? styles.thumbItemActive : {})
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
