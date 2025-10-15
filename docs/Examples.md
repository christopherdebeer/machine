# Examples

## Learn by Example

Explore real-world DyGram patterns and use cases.

<div className="feature-grid">
    <div className="feature">
        <h3 className="feature-title">01. KNOWLEDGE MANAGEMENT</h3>
        <p>Track ideas from conception to implementation:</p>
        <div className="code-block" style={{ marginTop: '1rem' }}>
            <pre style={{ background: 'var(--code-bg)', color: 'var(--light)', padding: '1.5rem', overflowX: 'auto', borderRadius: '4px', fontSize: '0.9rem' }}>{`machine "Knowledge System"

Concept idea "Neural Interface" {
    creator: "Research Team";
    priority<Integer>: 8;
    domain: "Neuroscience";
};

Implementation impl {
    status: "In Progress";
    owner: "Engineering";
};

Resource paper {
    url: "https://example.com/paper";
};

idea -inspires-> impl;
idea -documented_in-> paper;`}</pre>
        </div>
    </div>

    <div className="feature">
        <h3 className="feature-title">02. PROJECT MANAGEMENT</h3>
        <p>Model teams, features, and tasks:</p>
        <div className="code-block" style={{ marginTop: '1rem' }}>
            <pre style={{ background: 'var(--code-bg)', color: 'var(--light)', padding: '1.5rem', overflowX: 'auto', borderRadius: '4px', fontSize: '0.9rem' }}>{`machine "Project Tracker"

Team team {
    lead: "Jane Smith";
    members: ["Alice", "Bob"];
};

Feature dashboard {
    priority<Integer>: 8;
    status: "In Progress";
};

Task design {
    assignee: "Alice";
    status: "Completed";
};

team -owns-> dashboard;
dashboard -includes-> design;`}</pre>
        </div>
    </div>

    <div className="feature">
        <h3 className="feature-title">03. SUPPLY CHAIN</h3>
        <p>Model complex supply chain relationships:</p>
        <div className="code-block" style={{ marginTop: '1rem' }}>
            <pre style={{ background: 'var(--code-bg)', color: 'var(--light)', padding: '1.5rem', overflowX: 'auto', borderRadius: '4px', fontSize: '0.9rem' }}>{`machine "Supply Chain"

Entity supplier {
    location: "Shanghai";
    reliability<Float>: 0.92;
};

Entity component {
    sku: "CP-X5000";
    stock<Integer>: 250;
};

Process ordering {
    trigger: "Low stock";
    owner: "Procurement";
};

supplier -provides-> component;
component -tracked_in-> ordering;`}</pre>
        </div>
    </div>

    <div className="feature">
        <h3 className="feature-title">04. AI WORKFLOW</h3>
        <p>Build generative AI pipelines:</p>
        <div className="code-block" style={{ marginTop: '1rem' }}>
            <pre style={{ background: 'var(--code-bg)', color: 'var(--light)', padding: '1.5rem', overflowX: 'auto', borderRadius: '4px', fontSize: '0.9rem' }}>{`machine "Content Generator"

Input topic {
    subject<string>: "AI Safety";
};

Task research {
    prompt: "Research {{ topic.subject }}";
};

Task write {
    prompt: "Write article on research";
};

Result article {
    content: "TBD";
};

topic -> research -> write -> article;`}</pre>
        </div>
    </div>

    <div className="feature">
        <h3 className="feature-title">05. DATA PIPELINE</h3>
        <p>Simple data flow visualization:</p>
        <div className="code-block" style={{ marginTop: '1rem' }}>
            <pre style={{ background: 'var(--code-bg)', color: 'var(--light)', padding: '1.5rem', overflowX: 'auto', borderRadius: '4px', fontSize: '0.9rem' }}>{`machine "Data Pipeline"

Concept source "API";
Concept processor "Transform";
Concept destination "Database";

source -> processor -> destination;`}</pre>
        </div>
    </div>

    <div className="feature">
        <h3 className="feature-title">06. AUTHENTICATION FLOW</h3>
        <p>Security system modeling:</p>
        <div className="code-block" style={{ marginTop: '1rem' }}>
            <pre style={{ background: 'var(--code-bg)', color: 'var(--light)', padding: '1.5rem', overflowX: 'auto', borderRadius: '4px', fontSize: '0.9rem' }}>{`machine "Auth System"

Concept problem "User Auth" {
    domain: "Security";
    priority<Integer>: 9;
};

Concept solution "JWT Auth" {
    status: "Testing";
    approach: "Token-based";
};

Resource docs {
    url: "repo.com/auth-flow.pdf";
};

problem -solved_by-> solution;
solution -documented_in-> docs;`}</pre>
        </div>
    </div>
</div>

<div style={{ marginTop: '4rem', textAlign: 'center' }}>
    <h2 className="section-title">Try Them Yourself</h2>
    <p style={{ fontSize: '1.2rem', marginBottom: '2rem' }}>
        Copy any example and run it in the playground:
    </p>
    <a href="playground-mobile.html" className="btn">OPEN PLAYGROUND →</a>
</div>
