import React from 'react';

const Skeleton = ({ width, height, borderRadius, style }) => {
  return (
    <div
      className="skeleton"
      style={{
        width: width || '100%',
        height: height || '20px',
        borderRadius: borderRadius || '4px',
        marginBottom: '10px',
        ...style
      }}
    />
  );
};

export default Skeleton;