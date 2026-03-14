export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center">
      <div className="container flex max-w-4xl flex-col items-center gap-8 px-4 text-center">
        <h1 className="text-5xl font-bold tracking-tight sm:text-6xl">
          Build apps with{" "}
          <span className="bg-gradient-to-r from-purple-600 to-blue-500 bg-clip-text text-transparent">
            AI
          </span>
        </h1>
        <p className="max-w-2xl text-lg text-muted-foreground">
          Describe what you want to build, and Doable creates production-ready
          full-stack applications. From idea to deployment in minutes.
        </p>
        <div className="flex gap-4">
          <a
            href="/dashboard"
            className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-8 text-sm font-medium text-primary-foreground ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Get Started
          </a>
          <a
            href="https://github.com/doable"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 items-center justify-center rounded-md border border-input bg-background px-8 text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            GitHub
          </a>
        </div>
      </div>
    </main>
  );
}
