import React from 'react';
import { Helmet } from 'react-helmet-async';
import '../styles/fabsy-theme.scss';

const Founder = () => {
  return (
    <>
      <Helmet>
        <title>Lauren Bilon - Founder | Fabsy Traffic Services</title>
        <meta name="description" content="Meet Lauren Bilon, founder of Fabsy Traffic Services. Dedicated to helping Alberta women fight traffic tickets with expert defense strategies." />
      </Helmet>

      <div className="fabsy-hero">
        <div className="container">
          <h1 className="hero-title">Meet Lauren Bilon</h1>
          <p className="hero-sub">
            Founder & Lead Traffic Defense Specialist at Fabsy Traffic Services
          </p>
        </div>
      </div>

      <div className="section">
        <div className="container">
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '32px' }}>
            
            {/* Main content */}
            <div className="fabsy-card">
              <h2>Empowering Alberta Women Through Expert Traffic Defense</h2>
              <p>
                Lauren Bilon founded Fabsy Traffic Services with a clear mission: to provide Alberta women 
                with expert traffic ticket defense that's both accessible and effective. With years of 
                experience navigating Alberta's traffic court system, Lauren has built a practice focused 
                on achieving real results for her clients.
              </p>
              
              <h3>The Fabsy Difference</h3>
              <p>
                What sets Lauren apart is her deep understanding of both the legal landscape and the 
                unique challenges women face when dealing with traffic violations. She recognized that 
                many women felt intimidated by the legal process and needed an advocate who would not 
                only fight for them but also educate them about their rights.
              </p>
              
              <p>
                "Every ticket tells a story," Lauren explains. "My job is to examine every detail, 
                challenge every assumption, and ensure my clients get the fair treatment they deserve. 
                It's not just about avoiding points on your license—it's about justice."
              </p>
            </div>

            {/* Experience section */}
            <div className="fabsy-card">
              <h3>Professional Excellence</h3>
              <div className="hiw-list">
                <div className="step">
                  <div className="step__icon">🎓</div>
                  <div>
                    <div className="step__title">Specialized Training</div>
                    <div className="step__meta">
                      Certified in Alberta traffic law with ongoing professional development 
                      in defense strategies and court procedures.
                    </div>
                  </div>
                </div>

                <div className="step">
                  <div className="step__icon">⚖️</div>
                  <div>
                    <div className="step__title">Proven Track Record</div>
                    <div className="step__meta">
                      Successfully defended hundreds of traffic tickets across Alberta, 
                      with a focus on challenging evidence and procedural errors.
                    </div>
                  </div>
                </div>

                <div className="step">
                  <div className="step__icon">🤝</div>
                  <div>
                    <div className="step__title">Client-Centered Approach</div>
                    <div className="step__meta">
                      Provides personalized service with clear communication throughout 
                      the entire defense process.
                    </div>
                  </div>
                </div>

                <div className="step">
                  <div className="step__icon">🚗</div>
                  <div>
                    <div className="step__title">Comprehensive Coverage</div>
                    <div className="step__meta">
                      Handles all types of traffic violations including speeding, 
                      red light cameras, distracted driving, and more.
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Mission statement */}
            <div className="alert is-info">
              <h3 style={{ marginBottom: '12px' }}>Lauren's Mission</h3>
              <p style={{ marginBottom: '0' }}>
                "I believe every woman deserves skilled representation when facing traffic charges. 
                My commitment is to provide that representation with integrity, expertise, and 
                unwavering dedication to achieving the best possible outcome for each client."
              </p>
            </div>

            {/* Call to action */}
            <div className="fabsy-card" style={{ textAlign: 'center' }}>
              <h3>Ready to Fight Your Traffic Ticket?</h3>
              <p>
                Get Lauren's expertise on your side. Contact Fabsy Traffic Services today 
                for a free consultation about your traffic defense options.
              </p>
              
              <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap', marginTop: '24px' }}>
                <a href="/contact" className="btn is-primary">Get Free Consultation</a>
                <a href="/how-it-works" className="btn is-secondary">Learn Our Process</a>
              </div>
            </div>

          </div>
        </div>
      </div>
    </>
  );
};

export default Founder;