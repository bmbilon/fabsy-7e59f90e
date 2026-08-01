import { Link } from 'react-router-dom';
import '../styles/fabsy-theme.scss';
import useSafeHead from '@/hooks/useSafeHead';

const Founder = () => {
  useSafeHead({
    title: 'Lauren Bilon, Fabsy Founder | Alberta Agent Service',
    description: 'Meet Lauren Bilon, founder of Fabsy Traffic Ticket Services, an Alberta traffic ticket agent service that is not a law firm.',
    canonical: 'https://fabsy.ca/founder',
  });
  return (
    <>
      <div className="fabsy-hero">
        <div className="container">
          <h1 className="hero-title">Meet Lauren Bilon</h1>
          <p className="hero-sub">
            Founder at Fabsy Traffic Ticket Services
          </p>
        </div>
      </div>

      <div className="section">
        <div className="container">
          <div className="grid grid-cols-1 gap-8">
            
            {/* Main content */}
            <div className="fabsy-card">
              <h2>About Lauren</h2>
              <p>
                Lauren Bilon is the founder of Fabsy Traffic Ticket Services, an Alberta traffic ticket
                agent service.
              </p>
              <p>
                Fabsy is not a law firm and does not provide legal advice. It provides traffic ticket
                agent services where permitted and available.
              </p>
            </div>

            {/* Mission section */}
            <div className="fabsy-card">
              <h2>Fabsy's Mission</h2>
              <p>
                Fabsy's mission is to make Alberta traffic ticket agent services easier to understand
                and access. The service begins with a review of the ticket information submitted by
                the client.
              </p>
              <p>
                Availability and scope depend on the matter, the court location, and whether agent
                representation is permitted.
              </p>
            </div>

            {/* Call to action */}
            <div className="fabsy-card text-center">
              <h3>Ready to Submit Your Ticket?</h3>
              <p>
                Send Fabsy the ticket information for review. Submission does not mean the matter
                has been accepted.
              </p>
              
              <div className="mt-6 flex flex-wrap justify-center gap-4">
                <Link to="/submit-ticket" className="btn is-primary">Submit Your Ticket</Link>
                <Link to="/how-it-works" className="btn is-secondary">Learn the Process</Link>
              </div>
            </div>

          </div>
        </div>
      </div>
    </>
  );
};

export default Founder;
