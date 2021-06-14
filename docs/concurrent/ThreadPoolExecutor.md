# ThreadPoolExecutor

## 内部类

Worker 继承了 AbstractQueuedSynchronizer（AQS）实现了 Runnable（即可被线程运行）

### Worker

```java

    private final class Worker
        extends AbstractQueuedSynchronizer
        implements Runnable
    {
        /**
         * This class will never be serialized, but we provide a
         * serialVersionUID to suppress a javac warning.
         */
        private static final long serialVersionUID = 6138294804551838833L;

        /** Thread this worker is running in.  Null if factory fails. */
        // Worker运行所在的线程上
        final Thread thread;
        /** Initial task to run.  Possibly null. */
        // Worker所运行的任务，构造函数初始化赋值的
        Runnable firstTask;
        /** Per-thread task counter */
        volatile long completedTasks;

        /**
         * Creates with given first task and thread from ThreadFactory.
         * @param firstTask the first task (null if none)
         */
        Worker(Runnable firstTask) {
            // 设置AQS状态为-1
            setState(-1); // inhibit interrupts until runWorker
            // 赋值
            this.firstTask = firstTask;
            // ThreadFactory产生线程，并且赋值给thread变量
            this.thread = getThreadFactory().newThread(this);
        }

        /** Delegates main run loop to outer runWorker  */
        /**
         * run方法代理给runWorker执行
         */
        public void run() {
            runWorker(this);
        }

        // Lock methods
        //
        // The value 0 represents the unlocked state.
        // The value 1 represents the locked state.
        /**
         * 是否独占，当状态为1的时候为上锁状态
         */
        protected boolean isHeldExclusively() {
            return getState() != 0;
        }

        protected boolean tryAcquire(int unused) {
            // 通过cas尝试将状态由0->1
            if (compareAndSetState(0, 1)) {
                // 设置独占锁对应的线程也就是当前线程
                setExclusiveOwnerThread(Thread.currentThread());
                return true;
            }
            // 获取失败
            return false;
        }

        protected boolean tryRelease(int unused) {
            // 释放独占锁的线程
            setExclusiveOwnerThread(null);
            // 状态置于0
            setState(0);
            // 释放成功
            return true;
        }

        public void lock()        { acquire(1); }
        public boolean tryLock()  { return tryAcquire(1); }
        public void unlock()      { release(1); }
        public boolean isLocked() { return isHeldExclusively(); }

        void interruptIfStarted() {
            Thread t;
            if (getState() >= 0 && (t = thread) != null && !t.isInterrupted()) {
                try {
                    t.interrupt();
                } catch (SecurityException ignore) {
                }
            }
        }
    }
```

## 属性

### ctl

高 3 位来表示线程池状态，低 29 位来表示工作线程数量

作者通过巧妙的设计，将一个整型变量按二进制位分成两部分，分别表示两个信息。

```java
   /**
    * 原子型变量，通过 ctlOf 计算出 ctl的值
    */
   private final AtomicInteger ctl = new AtomicInteger(ctlOf(RUNNING, 0));

```

### COUNT_BITS

```java
    /**
     * Integer.SIZE为32位
     * 因为ctl高3位代表工作状态，低29位代表线程数量即 Integer.SIZE - 3
     */
    private static final int COUNT_BITS = Integer.SIZE - 3;
```

### CAPACITY 工作线程容量

```java
    /**
     * 1左移29位 2^29，因为32位的二进制计算是从0-31，表示29位最大数为2^29-1
     */
    private static final int CAPACITY   = (1 << COUNT_BITS) - 1;
```

### 状态

:::tip 解析

- 运行(RUNNING)：该状态下的线程池接收新任务并处理队列中的任务；线程池创建完毕就处于该状态，也就是正常状态；
- 关机(SHUTDOWN)：线程池不接受新任务，但处理队列中的任务；线程池调用 shutdown()之后的池状态；
- 停止(STOP)：线程池不接受新任务，也不处理队列中的任务，并中断正在执行的任务；线程池调用 shutdownNow()之后的池状态；
- 清理(TIDYING)：线程池所有任务已经终止，workCount(当前线程数)为 0；过渡到清理状态的线程将运行 terminated()钩子方法；
- 终止(TERMINATED)：terminated()方法结束后的线程池状态；

:::

```java

    private static final int RUNNING    = -1 << COUNT_BITS;
    private static final int SHUTDOWN   =  0 << COUNT_BITS;
    private static final int STOP       =  1 << COUNT_BITS;
    private static final int TIDYING    =  2 << COUNT_BITS;
    private static final int TERMINATED =  3 << COUNT_BITS;

```

### keepAliveTime

:::tip 概念

keepAliveTime 的单位是纳秒，即 1s=1000000000ns，1 秒等于 10 亿纳秒。

keepAliveTime 是线程池中空闲线程等待工作的超时时间。

当线程池中线程数量大于 corePoolSize（核心线程数量）或设置了 allowCoreThreadTimeOut（是否允许空闲核心线程超时）时，
线程会根据 keepAliveTime 的值进行活性检查，一旦超时便销毁线程。否则，线程会永远等待新的工作。

:::

```java
    private volatile long keepAliveTime;
```

### corePoolSize

线程池的基本大小，即在没有任务需要执行的时候线程池的大小，并且只有在工作队列满了的情况下才会创建超出这个数量的线程

```java
    private volatile int corePoolSize;
```

### maximumPoolSize

线程池中的当前线程数目不会超过该值。如果队列中任务已满，并且当前线程个数小于 maximumPoolSize，那么会创建新的线程来执行任务

```java
    private volatile int maximumPoolSize;
```

### workers

工作线程的集合

```java
    private final HashSet<Worker> workers = new HashSet<Worker>();
```

## 构造函数

```java

    public ThreadPoolExecutor(int corePoolSize,
                              int maximumPoolSize,
                              long keepAliveTime,
                              TimeUnit unit,
                              BlockingQueue<Runnable> workQueue) {
        this(corePoolSize, maximumPoolSize, keepAliveTime, unit, workQueue,
             Executors.defaultThreadFactory(), defaultHandler);
    }

    public ThreadPoolExecutor(int corePoolSize,
                              int maximumPoolSize,
                              long keepAliveTime,
                              TimeUnit unit,
                              BlockingQueue<Runnable> workQueue,
                              ThreadFactory threadFactory) {
        this(corePoolSize, maximumPoolSize, keepAliveTime, unit, workQueue,
             threadFactory, defaultHandler);
    }

    public ThreadPoolExecutor(int corePoolSize,
                              int maximumPoolSize,
                              long keepAliveTime,
                              TimeUnit unit,
                              BlockingQueue<Runnable> workQueue,
                              RejectedExecutionHandler handler) {
        this(corePoolSize, maximumPoolSize, keepAliveTime, unit, workQueue,
             Executors.defaultThreadFactory(), handler);
    }

    /**
     * 上面的构造函数，最终会调用到这里
     */
    public ThreadPoolExecutor(int corePoolSize,
                              int maximumPoolSize,
                              long keepAliveTime,
                              TimeUnit unit,
                              BlockingQueue<Runnable> workQueue,
                              ThreadFactory threadFactory,
                              RejectedExecutionHandler handler) {
        // 核心参数的校验，否则报非法参数异常
        if (corePoolSize < 0 ||
            maximumPoolSize <= 0 ||
            maximumPoolSize < corePoolSize ||
            keepAliveTime < 0)
            throw new IllegalArgumentException();
        // workQueue,threadFactory,handler不能为空
        if (workQueue == null || threadFactory == null || handler == null)
            // 抛出空指针异常
            throw new NullPointerException();
        // 获取java安全管理器
        this.acc = System.getSecurityManager() == null ?
                null :
                AccessController.getContext();
        // 属性赋值
        this.corePoolSize = corePoolSize;
        this.maximumPoolSize = maximumPoolSize;
        this.workQueue = workQueue;
        this.keepAliveTime = unit.toNanos(keepAliveTime);
        this.threadFactory = threadFactory;
        this.handler = handler;
    }

```

## 方法

### runStateOf

```java
    /**
     * 首先 CAPACITY   = (1 << COUNT_BITS) - 1;
     * CAPACITY是低29位全是1，那么取反就是 1110 0000 0000 0000 0000 0000 0000 0000
     * c & ~CAPACITY 运算之后低29位全部为0，保留高3，结果便是线程池工作状态
     */
    private static int runStateOf(int c)     { return c & ~CAPACITY; }
```

### workerCountOf

```java
    /**
     * CAPACITY是低29位全是1
     * c & ~CAPACITY 运算之后高3位全部是0，低29位保留，结果便是线程池线程数量
     */
    private static int workerCountOf(int c)  { return c & CAPACITY; }
```

### ctlOf

```java
    /**
     * 因为状态是高3位，线程数低29位，2者与运算，并不会冲突
     */
    private static int ctlOf(int rs, int wc) { return rs | wc; }
```

### execute

线程池的提交任务接口都实现在 AbstractExecutorService 中，而最终委托给了子类实现 execute 方法中
所以 execute 方法是主要的运行逻辑

```java

    public void execute(Runnable command) {
        // 任务非空判断
        if (command == null)
            // 否则抛出空指针异常
            throw new NullPointerException();
        /*
         * Proceed in 3 steps:
         *
         * 1. If fewer than corePoolSize threads are running, try to
         * start a new thread with the given command as its first
         * task.  The call to addWorker atomically checks runState and
         * workerCount, and so prevents false alarms that would add
         * threads when it shouldn't, by returning false.
         *
         * 2. If a task can be successfully queued, then we still need
         * to double-check whether we should have added a thread
         * (because existing ones died since last checking) or that
         * the pool shut down since entry into this method. So we
         * recheck state and if necessary roll back the enqueuing if
         * stopped, or start a new thread if there are none.
         *
         * 3. If we cannot queue task, then we try to add a new
         * thread.  If it fails, we know we are shut down or saturated
         * and so reject the task.
         */
        // 获取最新的ctl
        int c = ctl.get();
        // 如果工作线程数量小于核心线程数量
        if (workerCountOf(c) < corePoolSize) {
            if (addWorker(command, true))
                return;
            // 再次更新 c
            c = ctl.get();
        }
        if (isRunning(c) && workQueue.offer(command)) {
            int recheck = ctl.get();
            if (! isRunning(recheck) && remove(command))
                reject(command);
            else if (workerCountOf(recheck) == 0)
                addWorker(null, false);
        }
        else if (!addWorker(command, false))
            reject(command);
    }


```

### addWorker

```java
    private boolean addWorker(Runnable firstTask, boolean core) {
        retry:
        // 死循环
        for (;;) {
            // 获取最新ctl状态，赋值给变量c
            int c = ctl.get();
            // 获取线程池最新运行状态
            int rs = runStateOf(c);

            // Check if queue empty only if necessary.
            /*
             * 如果线程池状态至少为STOP,返回false，不接受任务。
             * 如果线程池状态为SHUTDOWN，并且firstTask不为null或者任务队列为空，同样不接受任务。
             * (SHUTDOWN装态，不接受新任务，但是处理工作列队的任务，一旦工作列队为空说明任务处理完了，addWorker没有走下去的必要了)
             */
            if (rs >= SHUTDOWN &&
                ! (rs == SHUTDOWN &&
                   firstTask == null &&
                   ! workQueue.isEmpty()))
                return false;
            // cas+死循环
            for (;;) {
                // 获取工作线程的最新数量
                int wc = workerCountOf(c);
                // 如果工作线程的数量达到最大值
                // 或
                // 工作线程的数量大于等于边界（core==true:corePoolSize为边界，core==flase:maximumPoolSize为边界）时
                // 都返回false，即添加失败
                if (wc >= CAPACITY ||
                    wc >= (core ? corePoolSize : maximumPoolSize))
                    return false;
                // cas设置线程数量，
                if (compareAndIncrementWorkerCount(c))
                    // 成功新增workCount,跳出整个循环往下走。
                    break retry;
                c = ctl.get();  // Re-read ctl
                /*
                 * 重读总控状态,如果运行状态变了，重试整个大循环。
                 * 否则说明是workCount发生了变化，因为cas失败了嘛，重试内层循环。
                 */
                if (runStateOf(c) != rs)
                    continue retry;
                // else CAS failed due to workerCount change; retry inner loop
            }
        }
        // 工作线程开始工作标志
        boolean workerStarted = false;
        // 是否加入了工作者集合
        boolean workerAdded = false;
        Worker w = null;
        try {
            // new一个Worker实例
            w = new Worker(firstTask);
            // 获取worker对应的线程
            final Thread t = w.thread;
            // 判断线程不能为空
            if (t != null) {
                final ReentrantLock mainLock = this.mainLock;
                // 加锁
                mainLock.lock();
                try {
                    // Recheck while holding lock.
                    // Back out on ThreadFactory failure or if
                    // shut down before lock acquired.
                    // 获取最新的线程池状态
                    int rs = runStateOf(ctl.get());
                    // 如果线程状态为运行状态
                    // 或者
                    // 线程池状态为SHUTDOWN，并且firstTask等于空
                    if (rs < SHUTDOWN ||
                        (rs == SHUTDOWN && firstTask == null)) {
                        // 如果线程在活动中，抛出异常
                        if (t.isAlive()) // precheck that t is startable
                            throw new IllegalThreadStateException();
                        // 添加到集合
                        workers.add(w);
                        // 获取工作者集合数量
                        int s = workers.size();
                        if (s > largestPoolSize)
                            // 更新largestPoolSize
                            largestPoolSize = s;
                        // 添加到工作者集合标志true
                        workerAdded = true;
                    }
                } finally {
                    // 释放锁
                    mainLock.unlock();
                }
                // 判断是否添加成功
                if (workerAdded) {
                    // 启动线程
                    t.start();
                    // 工作标志true
                    workerStarted = true;
                }
            }
        } finally {
            // 如果线程没有启动说明线程状态至少大于SHUTDOWN了
            if (! workerStarted)
                addWorkerFailed(w);
        }
        return workerStarted;
    }
```

### addWorkerFailed

```java

    private void addWorkerFailed(Worker w) {
        final ReentrantLock mainLock = this.mainLock;
        mainLock.lock();
        try {
            if (w != null)
                workers.remove(w);
            // 循环执行CAS操作直到让workerCount数量减少1
            decrementWorkerCount();
            // 执行tryTerminate方法
            tryTerminate();
        } finally {
            mainLock.unlock();
        }
    }

```

### decrementWorkerCount

```java

    private void decrementWorkerCount() {
        do {} while (! compareAndDecrementWorkerCount(ctl.get()));
    }
```

### tryTerminate

尝试结束线程池

```java

    final void tryTerminate() {
        // 死循环
        for (;;) {
            // 获取控制状态
            int c = ctl.get();
            if (isRunning(c) ||
                runStateAtLeast(c, TIDYING) ||
                (runStateOf(c) == SHUTDOWN && ! workQueue.isEmpty()))
                return;
            if (workerCountOf(c) != 0) { // Eligible to terminate
                interruptIdleWorkers(ONLY_ONE);
                return;
            }

            final ReentrantLock mainLock = this.mainLock;
            mainLock.lock();
            try {
                if (ctl.compareAndSet(c, ctlOf(TIDYING, 0))) {
                    try {
                        terminated();
                    } finally {
                        ctl.set(ctlOf(TERMINATED, 0));
                        termination.signalAll();
                    }
                    return;
                }
            } finally {
                mainLock.unlock();
            }
            // else retry on failed CAS
        }
    }
```
