# ThreadPoolExecutor

## 内部类

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

        boolean workerStarted = false;
        boolean workerAdded = false;
        Worker w = null;
        try {
            w = new Worker(firstTask);
            final Thread t = w.thread;
            if (t != null) {
                final ReentrantLock mainLock = this.mainLock;
                mainLock.lock();
                try {
                    // Recheck while holding lock.
                    // Back out on ThreadFactory failure or if
                    // shut down before lock acquired.
                    int rs = runStateOf(ctl.get());

                    if (rs < SHUTDOWN ||
                        (rs == SHUTDOWN && firstTask == null)) {
                        if (t.isAlive()) // precheck that t is startable
                            throw new IllegalThreadStateException();
                        workers.add(w);
                        int s = workers.size();
                        if (s > largestPoolSize)
                            largestPoolSize = s;
                        workerAdded = true;
                    }
                } finally {
                    mainLock.unlock();
                }
                if (workerAdded) {
                    t.start();
                    workerStarted = true;
                }
            }
        } finally {
            if (! workerStarted)
                addWorkerFailed(w);
        }
        return workerStarted;
    }
```
