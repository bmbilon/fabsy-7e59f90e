import { useParams } from 'react-router-dom';

const WorkingContentPage = () => {
  const { slug } = useParams();

  return (
    <div>
      <h1>Working Content Page</h1>
      <p>Slug: {slug || 'undefined (static route)'}</p>
      <p>Adding components one by one to find the issue...</p>
    </div>
  );
};

export default WorkingContentPage;