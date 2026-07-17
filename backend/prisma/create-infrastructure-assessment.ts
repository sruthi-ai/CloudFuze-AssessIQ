/**
 * Create/rebuild "Infrastructure Assessment":
 *   40 questions in 40 minutes, 40 marks — 20 randomly drawn from the existing
 *   100-question Aptitude pool + 20 randomly drawn from a new 56-question Infra
 *   pool, each pool its own 20-minute section (1 mark each).
 *
 * Idempotent — safe to re-run: infra questions are only created if missing
 * (matched by title), and the test's sections are cleanly rebuilt each run so
 * pool sizes/timing always match this script, without touching the Aptitude
 * question bank itself.
 *
 *   docker exec -w /app neutaraassessment-backend-1 npx tsx prisma/create-infrastructure-assessment.ts
 *
 * Env overrides: TEST_TITLE (default "Infrastructure Assessment"),
 *                APTITUDE_BANK_NAME (default "Freshers Assessment 1"),
 *                APTI_POOL_SIZE (default 20), INFRA_POOL_SIZE (default 20),
 *                SECTION_MIN (default 20 — minutes per section; total duration = 2x this).
 */
import { PrismaClient, TestStatus } from '@prisma/client'
const prisma = new PrismaClient()

const INFRA_BANK_NAME = 'Infra Questions Bank'

// [title suffix, body, options A-D, correct index 0-3] — transcribed 1:1 from the
// supplied Q1-Q56 + answer key.
const INFRA_QUESTIONS: { body: string; options: string[]; correct: number }[] = [
  { body: "Which command changes both the owner and group of a file in a single step?", options: ["chmod", "chown", "chgrp", "umask"], correct: 1 },
  { body: "Which protocol operates at Layer 4 of the OSI model and guarantees reliable, ordered delivery of data?", options: ["IP", "TCP", "ICMP", "ARP"], correct: 1 },
  { body: "Which command lists only the currently running containers?", options: ["docker ps -a", "docker ps", "docker images", "docker container ls -a"], correct: 1 },
  { body: "What is the smallest deployable unit that can be created and managed in Kubernetes?", options: ["Container", "Pod", "Node", "Deployment"], correct: 1 },
  { body: "In AWS, what does an IAM Role primarily provide?", options: ["Extra storage capacity", "Temporary permissions that can be assumed by users or services", "A dedicated VPC subnet", "A consolidated billing account"], correct: 1 },
  { body: "What does the Git command 'git rebase' primarily do?", options: ["Creates a merge commit joining two branches", "Reapplies a series of commits on top of another base commit", "Permanently deletes a branch", "Creates an annotated tag"], correct: 1 },
  { body: "What does the 'principle of least privilege' mean?", options: ["Granting maximum access to all users for convenience", "Granting users and systems only the access necessary to perform their function", "Disabling all permissions permanently by default", "Sharing admin credentials across the team"], correct: 1 },
  { body: "What is the primary purpose of establishing a monitoring baseline?", options: ["To define acceptable/normal system behavior so anomalies can be detected", "To set the maximum allowed server room temperature", "To configure DNS records for new servers", "To encrypt log files at rest"], correct: 0 },
  { body: "What is the primary purpose of the 'sticky bit' when set on a directory?", options: ["It prevents non-owners from deleting or renaming other users' files in that directory", "It prevents any file in the directory from being executed", "It forces every new file to inherit the SUID bit", "It disables the creation of symbolic links"], correct: 0 },
  { body: "How many usable host addresses does a /26 subnet provide?", options: ["254", "62", "30", "126"], correct: 1 },
  { body: "What kind of layer does a Dockerfile 'RUN' instruction create in the resulting image?", options: ["A temporary writable container layer only", "A new read-only image layer", "A named volume", "A network bridge layer"], correct: 1 },
  { body: "Which Kubernetes object is responsible for ensuring a specified number of identical pod replicas are running at all times?", options: ["Service", "ReplicaSet", "ConfigMap", "Ingress"], correct: 1 },
  { body: "Which AWS service is primarily used for scalable object storage?", options: ["EBS", "EFS", "S3", "RDS"], correct: 2 },
  { body: "What is the purpose of a '.gitignore' file in a repository?", options: ["To encrypt sensitive files before committing them", "To specify files and patterns that Git should not track", "To define branch protection and merge rules", "To store the full commit history"], correct: 1 },
  { body: "What best describes Multi-Factor Authentication (MFA)?", options: ["An additional verification step beyond just a password to confirm identity", "A method for managing file-level permissions", "A type of firewall configuration", "A mandatory field validation rule in forms"], correct: 0 },
  { body: "Which term describes the average time taken to detect and resolve an incident after it occurs?", options: ["MTTR (Mean Time To Resolve/Repair)", "SLA (Service Level Agreement)", "RTO (Recovery Time Objective)", "CPU utilization"], correct: 0 },
  { body: "Under systemd, which file typically defines the default boot target (equivalent to the old default runlevel)?", options: ["/etc/inittab", "/etc/systemd/system/default.target", "/etc/rc.local", "/boot/grub.cfg"], correct: 1 },
  { body: "Which DNS record type maps a hostname to an IPv6 address?", options: ["A", "AAAA", "CNAME", "MX"], correct: 1 },
  { body: "Which Docker network mode causes a container to share the host machine's network namespace directly?", options: ["bridge", "none", "host", "overlay"], correct: 2 },
  { body: "Which control plane component is responsible for deciding which node a newly created pod should run on?", options: ["kubelet", "kube-scheduler", "kube-proxy", "etcd"], correct: 1 },
  { body: "What does the term 'elasticity' refer to in cloud computing?", options: ["Maintaining fixed capacity regardless of demand", "Automatically scaling resources up or down based on demand", "Replicating data across multiple regions", "Encrypting data at rest by default"], correct: 1 },
  { body: "What does the phrase 'pipeline as code' mean in a CI/CD context?", options: ["The pipeline configuration is defined and version-controlled in files (e.g., YAML) alongside the codebase", "The pipeline can only be triggered manually", "Code is compiled exclusively inside the pipeline", "The pipeline runs only when a new branch is created"], correct: 0 },
  { body: "Which of the following best describes a 'man-in-the-middle' attack?", options: ["Malware that encrypts a victim's files for ransom", "Intercepting, and possibly altering, communication between two parties without their knowledge", "Overwhelming a server with excessive traffic", "Repeatedly guessing passwords to gain access"], correct: 1 },
  { body: "On a Linux system, what does a high load average combined with low CPU usage often indicate?", options: ["A memory leak in the kernel", "Processes are spending significant time waiting on I/O", "The network interface is saturated", "The root filesystem is full"], correct: 1 },
  { body: "In Linux, what range of values can the 'nice' value for a process take?", options: ["0 to 99", "-20 to 19", "1 to 100", "-10 to 10"], correct: 1 },
  { body: "What is the primary purpose of the Address Resolution Protocol (ARP)?", options: ["Resolving domain names to IP addresses", "Resolving IP addresses to MAC addresses on a local network", "Routing packets between different networks", "Encrypting traffic between hosts"], correct: 1 },
  { body: "What is the main benefit of using a multi-stage build in a Dockerfile?", options: ["It allows running multiple containers in parallel", "It reduces the final image size by discarding build-time-only dependencies", "It is required to enable multi-architecture builds", "It allows multiple CMD instructions to run simultaneously"], correct: 1 },
  { body: "Which Kubernetes Service type exposes the service on a static port on every node's IP address?", options: ["ClusterIP", "NodePort", "LoadBalancer", "ExternalName"], correct: 1 },
  { body: "Which Azure service is the closest equivalent to AWS EC2?", options: ["Azure Blob Storage", "Azure Virtual Machines", "Azure Functions", "Azure SQL Database"], correct: 1 },
  { body: "Which Git command is used to view the difference between the working directory and the staging area?", options: ["git status", "git diff", "git log", "git show"], correct: 1 },
  { body: "What is the main purpose of TLS/SSL certificates?", options: ["Compressing data during network transfer", "Authenticating identity and encrypting data in transit", "Speeding up DNS resolution", "Balancing load across multiple servers"], correct: 1 },
  { body: "In a monitoring/alerting system, what is an 'alert threshold'?", options: ["The value at which point an alert is triggered", "The total number of servers being monitored", "The retention period configured for logs", "The refresh rate of a dashboard"], correct: 0 },
  { body: "Which command is best suited to view real-time disk I/O usage broken down by process?", options: ["iotop", "top", "vmstat", "free"], correct: 0 },
  { body: "Which TCP flag is used to gracefully terminate a connection?", options: ["SYN", "FIN", "RST", "URG"], correct: 1 },
  { body: "Which command removes all stopped containers, unused networks, and dangling images in one go?", options: ["docker rm -f", "docker system prune", "docker clean", "docker volume prune"], correct: 1 },
  { body: "What kind of data is stored in etcd within a Kubernetes cluster?", options: ["Container images", "The cluster's state and configuration data", "Pod application logs", "Node-level performance metrics"], correct: 1 },
  { body: "What is the key difference between IaaS and PaaS?", options: ["IaaS manages the OS and runtime for you, while PaaS does not", "PaaS manages the OS and runtime, letting users focus on application code", "They are functionally identical service models", "IaaS is used exclusively for storage services"], correct: 1 },
  { body: "What is a key benefit of Continuous Integration (CI)?", options: ["Deploying to production manually once a quarter", "Detecting integration issues early through frequent automated builds and tests", "Avoiding automated testing to save time", "Skipping code review to speed up merges"], correct: 1 },
  { body: "What is the primary function of a Web Application Firewall (WAF)?", options: ["Preventing physical theft of servers", "Protecting against application-layer attacks such as SQL injection and XSS", "Preventing power outages from affecting servers", "Fixing DNS misconfigurations automatically"], correct: 1 },
  { body: "Which tool is most commonly associated with time-series metrics collection and alerting in infrastructure teams?", options: ["Prometheus", "Git", "Docker Compose", "Terraform"], correct: 0 },
  { body: "A 'zombie' process in Linux is best described as one that:", options: ["Consumes 100% of CPU continuously", "Has finished executing but still has an entry in the process table", "Is a special kernel-only background thread", "Is permanently blocked waiting for disk I/O"], correct: 1 },
  { body: "Which port does HTTPS use by default?", options: ["80", "443", "22", "21"], correct: 1 },
  { body: "What is the primary purpose of Docker volumes?", options: ["Isolating CPU usage between containers", "Persisting data beyond the lifecycle of a single container", "Limiting network bandwidth for a container", "Compressing container images"], correct: 1 },
  { body: "Which Kubernetes object is designed to store sensitive data such as passwords and API keys?", options: ["ConfigMap", "Secret", "Namespace", "PersistentVolume"], correct: 1 },
  { body: "Which GCP service provides managed Kubernetes for container orchestration?", options: ["Cloud Run", "Google Kubernetes Engine (GKE)", "App Engine", "Cloud Functions"], correct: 1 },
  { body: "What best describes a 'canary deployment' in a CI/CD pipeline?", options: ["Deploying a change to all users simultaneously", "Gradually rolling out a change to a small subset of users before a full rollout", "Automatically rolling back on any single error", "Deploying changes only during weekends"], correct: 1 },
  { body: "What is the main goal of patch management in infrastructure security?", options: ["Writing new application features", "Regularly applying updates to fix known vulnerabilities", "Managing user password resets only", "Creating a backup schedule"], correct: 1 },
  { body: "What is the primary purpose of log aggregation?", options: ["Automatically deleting old log files", "Centralizing logs from multiple sources for easier searching and analysis", "Compressing binary application files", "Encrypting logs at the source"], correct: 1 },
  { body: "For a file with permissions set via 'chmod 750', what access does the 'others' category have?", options: ["rwx (read, write, execute)", "r-x (read, execute)", "--- (no access)", "rw- (read, write)"], correct: 2 },
  { body: "What problem does Network Address Translation (NAT) primarily solve?", options: ["Encrypting network packets", "Conserving public IPv4 addresses by allowing multiple devices to share one", "Resolving domain names to IP addresses", "Distributing load across multiple servers"], correct: 1 },
  { body: "What does the 'EXPOSE' instruction in a Dockerfile actually do?", options: ["Opens the specified port directly on the host machine", "Documents the port the container listens on, without publishing it (metadata only)", "Creates a firewall rule allowing external traffic", "Starts a reverse proxy automatically"], correct: 1 },
  { body: "If a Pod with no attached PersistentVolume is deleted, what happens to its data?", options: ["It persists on the node indefinitely", "The data is lost", "It is automatically backed up to cloud storage", "It is moved to another running pod"], correct: 1 },
  { body: "What is a 'region' in the context of major cloud providers?", options: ["A single physical data center", "A geographical area containing multiple, isolated availability zones", "A type of virtual private network", "A billing group for cost allocation"], correct: 1 },
  { body: "What does 'git cherry-pick' allow you to do?", options: ["Permanently delete a specific commit", "Apply a specific commit from one branch onto another branch", "Merge every branch in the repository at once", "Revert only the most recent commit"], correct: 1 },
  { body: "Which of the following is the best example of 'defense in depth'?", options: ["Relying solely on a single perimeter firewall", "Using multiple layered security controls such as firewalls, IAM, encryption, and monitoring together", "Disabling logging to reduce noise and cost", "Using one shared password across all accounts for simplicity"], correct: 1 },
  { body: "When troubleshooting a reported 'slow application', what is generally the best FIRST step?", options: ["Immediately restart the entire server", "Gather relevant metrics and logs to identify the actual bottleneck", "Increase server RAM without further investigation", "Wait until more users complain before acting"], correct: 1 },
]

async function main() {
  const testTitle = process.env.TEST_TITLE || 'Infrastructure Assessment'
  const aptitudeBankName = process.env.APTITUDE_BANK_NAME || 'Freshers Assessment 1'
  const aptiPoolSize = Number(process.env.APTI_POOL_SIZE) || 20
  const infraPoolSize = Number(process.env.INFRA_POOL_SIZE) || 20
  const sectionMin = Number(process.env.SECTION_MIN) || 20

  const aptiBank = await prisma.questionBank.findFirst({ where: { name: aptitudeBankName } })
  if (!aptiBank) throw new Error(`Aptitude bank "${aptitudeBankName}" not found.`)
  const tenantId = aptiBank.tenantId

  const admin = await prisma.user.findFirst({
    where: { tenantId, role: { in: ['SUPER_ADMIN', 'COMPANY_ADMIN'] } },
    orderBy: { createdAt: 'asc' },
  })
  if (!admin) throw new Error('No admin user found for the tenant.')

  const aptiQuestions = await prisma.question.findMany({
    where: { bankId: aptiBank.id, title: { startsWith: 'Aptitude Q' } },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  })
  if (aptiQuestions.length < aptiPoolSize) throw new Error(`Only ${aptiQuestions.length} aptitude questions — need at least ${aptiPoolSize}.`)

  // ── Infra bank + questions (create-if-missing, by title) ────────────────────
  let infraBank = await prisma.questionBank.findFirst({ where: { name: INFRA_BANK_NAME, tenantId } })
  if (!infraBank) {
    infraBank = await prisma.questionBank.create({ data: { name: INFRA_BANK_NAME, tenantId, description: 'Infrastructure/DevOps MCQ pool — Linux, networking, Docker, Kubernetes, cloud, CI/CD, security.' } })
  }

  let created = 0
  for (let i = 0; i < INFRA_QUESTIONS.length; i++) {
    const title = `Infra Q${i + 1}`
    const existing = await prisma.question.findFirst({ where: { bankId: infraBank.id, title } })
    if (existing) continue
    const q = INFRA_QUESTIONS[i]
    await prisma.question.create({
      data: {
        bankId: infraBank.id, type: 'MCQ_SINGLE', title, body: q.body,
        difficulty: 'MEDIUM', points: 1, domain: 'Infrastructure',
        options: { create: q.options.map((text, idx) => ({ text, isCorrect: idx === q.correct, order: idx })) },
      },
    })
    created++
  }
  console.log(`Infra bank: ${created} question(s) created, ${INFRA_QUESTIONS.length - created} already existed.`)

  const infraQuestions = await prisma.question.findMany({
    where: { bankId: infraBank.id, title: { startsWith: 'Infra Q' } },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  })
  if (infraQuestions.length < infraPoolSize) throw new Error(`Only ${infraQuestions.length} infra questions — need at least ${infraPoolSize}.`)

  // ── Test: two sections, one pool each ───────────────────────────────────────
  const totalMin = sectionMin * 2
  const instructions = `Infrastructure Assessment — ${totalMin} minutes, ${aptiPoolSize + infraPoolSize} questions, 1 mark each. ` +
    `Section 1 (Aptitude): a random ${aptiPoolSize} of ${aptiQuestions.length} questions, ${sectionMin} minutes. ` +
    `Section 2 (Infrastructure): a random ${infraPoolSize} of ${infraQuestions.length} questions, ${sectionMin} minutes. Choose the best option.`

  let test = await prisma.test.findFirst({ where: { title: testTitle, tenantId } })
  if (!test) {
    test = await prisma.test.create({
      data: {
        title: testTitle, domain: 'Infrastructure', duration: totalMin,
        status: TestStatus.DRAFT, proctoring: true, enforceViolations: false, sebRequired: false,
        tenantId, createdById: admin.id, instructions,
      },
    })
    console.log(`created test "${testTitle}"`)
  } else {
    const secs = await prisma.testSection.findMany({ where: { testId: test.id } })
    for (const s of secs) await prisma.testQuestion.deleteMany({ where: { sectionId: s.id } })
    await prisma.testSection.deleteMany({ where: { testId: test.id } })
    await prisma.test.update({ where: { id: test.id }, data: { duration: totalMin, instructions } })
    console.log(`rebuilt existing test "${testTitle}"`)
  }

  const aptiSection = await prisma.testSection.create({
    data: { testId: test.id, title: 'Aptitude', skill: 'GENERAL', order: 0, timeLimit: sectionMin * 60, pickCount: aptiPoolSize,
      description: `${aptiPoolSize} questions (randomly drawn from a bank of ${aptiQuestions.length}) covering quantitative ability, logical reasoning and data interpretation. 1 mark each.` },
  })
  await prisma.testQuestion.createMany({
    data: aptiQuestions.map((q, i) => ({ testId: test!.id, sectionId: aptiSection.id, questionId: q.id, order: i, points: 1 })),
  })

  const infraSection = await prisma.testSection.create({
    data: { testId: test.id, title: 'Infrastructure', skill: 'GENERAL', order: 1, timeLimit: sectionMin * 60, pickCount: infraPoolSize,
      description: `${infraPoolSize} questions (randomly drawn from a bank of ${infraQuestions.length}) covering Linux, networking, Docker, Kubernetes, cloud platforms, CI/CD and security fundamentals. 1 mark each.` },
  })
  await prisma.testQuestion.createMany({
    data: infraQuestions.map((q, i) => ({ testId: test!.id, sectionId: infraSection.id, questionId: q.id, order: i, points: 1 })),
  })

  console.log(`\n✅ "${testTitle}": Aptitude ${aptiPoolSize}/${aptiQuestions.length} (${sectionMin}min) + Infrastructure ${infraPoolSize}/${infraQuestions.length} (${sectionMin}min) = ${totalMin} min, ${aptiPoolSize + infraPoolSize} marks. Status DRAFT — publish it in the admin UI to use.`)
}

main().catch(e => { console.error('❌ create-infrastructure-assessment failed:', e); process.exit(1) }).finally(() => prisma.$disconnect())
