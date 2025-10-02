import { useParams } from 'react-router-dom';

const MinimalDynamic = () => {
  const { slug } = useParams();

  return (
    <div style={{ padding: '20px' }}>
      <h1>Minimal Dynamic Test</h1>
      <p>Slug parameter: {slug}</p>
      <p>This tests ONLY useParams with no other imports.</p>
    </div>
  );
};

export default MinimalDynamic;