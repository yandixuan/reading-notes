# ConcurrentHashMap

[文章参考](https://blog.csdn.net/weixin_30342639/article/details/107420546)
[文章参考](https://juejin.cn/post/6844903607901356046)

Java 7 为实现并行访问，引入了 Segment 这一结构，实现了分段锁，理论上最大并发度与 Segment 个数相等。

Java 8 放弃了一个 HashMap 被一个 Segment 封装加上锁的复杂设计，取而代之的是在 HashMap 的每个 Node 上增加 CAS + Synchronized 来保证并发安全进行实现。

同时为了提高哈希碰撞下的寻址性能，Java 8 在链表长度超过一定阈值（8）时将链表（寻址时间复杂度为 O(N)）转换为 红黑树（寻址时间复杂度为 O(log(N))）

那么我肯定是基于 java8 进行源码学习

:::tip 提示
在 HashMap 中是允许 key 和 value 为 null 的，而在 ConcurrentHashMap 中则是不允许的会直接抛出空指针异常。
在 HashMap 根据 key 获取的值是 null，而我们根本分不清楚到底这个 key 是不存在导致 get 为 null 还是存在还是值为 null，确实但是 hashMap 中我们可以
通过 containsKey 来判断属于哪一种情况，而在多线程的环境中，null 存在二义性，索性 Doug Lea 设定好代码规范 key，value 都不能为 null
:::

```java
    public class ConcurrentHashMap<K,V> extends AbstractMap<K,V>
    implements ConcurrentMap<K,V>, Serializable {
        private static final long serialVersionUID = 7249069246763182397L;

    ...省略
    }
```

## 属性

### TREEBIN

红黑树根节点的 hash 值即-2

```java
    static final int TREEBIN   = -2;
```

### MOVED

forwarding nodes 节点的 hash 值，只有 table 发生扩容的时候，ForwardingNode 才会发挥作用，表示当前节点正处于 resize 的过程 (表示 map 正在扩容)

```java
    static final int MOVED     = -1; // hash for forwarding nodes
```

### HASH_BITS

0x7fffffff 是 16 进制，转化成二进制是正数的最大值（即 0111 1111 1111 1111 1111 1111 1111 1111）。

作用其实就是避免 hash 值是负数，大概是因为 ConcurrentHashMap 内置了 MOVED、TREEBIN、RESERVED 这 3 个 hash（是负数），为了避免冲突吧。

```java
    static final int HASH_BITS = 0x7fffffff; // usable bits of normal node hash
```

### nextTable

resize 的时候使用

```java
    private transient volatile Node<K,V>[] nextTable;
```

### RESIZE_STAMP_BITS

用来给 resizeStamp 调用生成一个和扩容有关的扩容戳

```java
    private static int RESIZE_STAMP_BITS = 16;
```

:::tip SizeCtl

- 为 0 的时候代表表示还没有初始化
- 在调用有参构造函数的时候，存放的是需要初始化的容量
- 初始化之后表示下一次扩容的阈值

:::

### UNSAFE

```java

// 获取obj对象中offset偏移地址对应的object型field的值,支持volatile load语义。
public native Object getObjectVolatile(Object obj, long offset);

// 获取数组中第一个元素的偏移量(get offset of a first element in the array)
public native int arrayBaseOffset(java.lang.Class aClass);

//获取数组中一个元素的大小(get size of an element in the array)
public native int arrayIndexScale(java.lang.Class aClass);

```

```java

    // Unsafe mechanics
    private static final sun.misc.Unsafe U;
    private static final long SIZECTL;
    private static final long TRANSFERINDEX;
    private static final long BASECOUNT;
    private static final long CELLSBUSY;
    private static final long CELLVALUE;
    private static final long ABASE;
    private static final int ASHIFT;

    static {
        try {
            // 获取UNSAFE实例
            U = sun.misc.Unsafe.getUnsafe();
            // 获取 ConcurrentHashMap的Class对象
            Class<?> k = ConcurrentHashMap.class;
            SIZECTL = U.objectFieldOffset
                (k.getDeclaredField("sizeCtl"));
            TRANSFERINDEX = U.objectFieldOffset
                (k.getDeclaredField("transferIndex"));
            BASECOUNT = U.objectFieldOffset
                (k.getDeclaredField("baseCount"));
            CELLSBUSY = U.objectFieldOffset
                (k.getDeclaredField("cellsBusy"));
            Class<?> ck = CounterCell.class;
            CELLVALUE = U.objectFieldOffset
                (ck.getDeclaredField("value"));
            // 获取Node的class对象，在ConcurrentHashMap中Node便是主要存储介质
            Class<?> ak = Node[].class;
            /**
            * 获取Node数组在内存中第一个元素的偏移位置,这部分偏移量等于对象头的长度
            * 64位jdk，对象头： markword 8字节、class pointer 4字节（默认开启压缩）、arr length 4字节，所以ABASE=16
            */
            ABASE = U.arrayBaseOffset(ak);
            /**
            * 获取数组中元素的增量地址，就是数组元素每个元素的空间大小，比如int，就是4
            * 结合来使用 ABASE+i*scale就是每个元素对应的内存位置
            */
            int scale = U.arrayIndexScale(ak);
            // 检验2的幂次方
            if ((scale & (scale - 1)) != 0)
                throw new Error("data type scale not a power of two");
            /**
            * Integer.numberOfLeadingZeros 该方法的作用是返回无符号整型i的最高非零位前面的0的个数，包括符号位在内；
            * ASHIFT也就是相应每个元素对应的长度 其实就是4 这里是用位移优化计算效率
            * 为啥用31去减 因为scale的二进制前面（32-3也等同于index相减31-2）个0，从而得出偏移量 0100（10进制2）
            * 数组寻址 数组寻址[i]位置地址 = 数组初始偏移+元素大小*i;(数组是连续的内存空间)
            * 在这里就是 ABASE+i<<ASHIFT = ABASE+i*4 跟上面的寻址公式对应
            */
            ASHIFT = 31 - Integer.numberOfLeadingZeros(scale);
        } catch (Exception e) {
            throw new Error(e);
        }
    }

```

那么顺带我们也把 Integer.numberOfLeadingZeros 给分析下子

#### 这一系列的判断，实际上是二分法的应用。

如果 i 无符号右移 16 位等于 0 说明 那么说明最高非 0 的数在低 16 位，那么位数 n 可以先加 16 位（前面都是 0）,并且将 i 的低 16 位左移 16 位(这里我们发现规律相当于是把前面的 0 都移除掉了)

如果 i 无符号右移 24 位等于 0 说明 那么说明最高非 0 的数在低 24 位，那么位数 n 可以先加 8 位 （前面都是 0）,并且将 i 的低 24 位左移 8 位(这里我们发现规律相当于是把前面的 0 都移除掉了)

...

后续依次类推

最后我们处理到了 30 位，实际上是处理最后 2 位 无论是 01 还是 10 i 右移 31 位只剩 1 位，

举个例子 10 右移 31 位 0....1 1+30-1=30 个 0

举个例子 01 右移 31 位 0....0 1+30-0=31 个 0

```java
    /**
    * 该方法的作用是返回无符号整型i的最高非零位前面的0的个数，包括符号位在内；
    * 如果i为负数，这个方法将会返回0，符号位为1.
    */
    public static int numberOfLeadingZeros(int i) {
        // HD, Figure 5-6
        if (i == 0)
            return 32;
        int n = 1;
        if (i >>> 16 == 0) { n += 16; i <<= 16; }
        if (i >>> 24 == 0) { n +=  8; i <<=  8; }
        if (i >>> 28 == 0) { n +=  4; i <<=  4; }
        if (i >>> 30 == 0) { n +=  2; i <<=  2; }
        n -= i >>> 31;
        return n;
    }

```

## 内部类

### TreeBin

TreeBin 并不是红黑树的存储节点，TreeBin 通过 root 属性维护红黑树的根结点，因为红黑树在旋转的时候，
根结点可能会被它原来的子节点替换掉，在这个时间点，如果有其他线程要写这棵红黑树就会发生线程不安全问题，
所以在 ConcurrentHashMap 中 TreeBin 通过 waiter 属性维护当前使用这棵红黑树的线程，来防止其他线程的进入

```java

    static final class TreeBin<K,V> extends Node<K,V> {
        // 维护树根节点
        TreeNode<K,V> root;
        // 链表头节点
        volatile TreeNode<K,V> first;
        // 最近一个设置waiter标识的线程
        volatile Thread waiter;
        // 锁状态标识
        volatile int lockState;
        // values for lockState
        // 写锁 写是独占状态，以散列表来看，真正进入到TreeBin中的写线程 同一时刻 只有一个线程
        static final int WRITER = 1; // set while holding write lock
        // 等待者状态（写线程在等待），当TreeBin中有读线程目前正在读取数据时，写线程无法修改数据
        static final int WAITER = 2; // set when waiting for write lock
        // 读锁 读锁是共享，同一时刻可以有多个线程 同时进入到 TreeBin对象中获取数据
        static final int READER = 4; // increment value for setting read lock

        /**
         * Tie-breaking utility for ordering insertions when equal
         * hashCodes and non-comparable. We don't require a total
         * order, just a consistent insertion rule to maintain
         * equivalence across rebalancings. Tie-breaking further than
         * necessary simplifies testing a bit.
         */
        static int tieBreakOrder(Object a, Object b) {
            int d;
            if (a == null || b == null ||
                (d = a.getClass().getName().
                 compareTo(b.getClass().getName())) == 0)
                d = (System.identityHashCode(a) <= System.identityHashCode(b) ?
                     -1 : 1);
            return d;
        }

        /**
         * 根据TreeNode节点B初始化 TreeBin
         * Creates bin with initial set of nodes headed by b.
         */
        TreeBin(TreeNode<K,V> b) {
            // TreeBin节点hash值为 TREEBIN 即-2
            super(TREEBIN, null, null, null);
            // 链表起始节点为TreeNode b
            this.first = b;
            // 根节点r置空
            TreeNode<K,V> r = null;
            for (TreeNode<K,V> x = b, next; x != null; x = next) {
                // 先获取b的下一个节点
                next = (TreeNode<K,V>)x.next;
                // 将x的左右子节点强行置空
                x.left = x.right = null;
                // 条件成立：说明当前红黑树 是一个空树，那么设置插入元素 为根节点
                if (r == null) {
                    x.parent = null;
                    // 根节点为黑色
                    x.red = false;
                    r = x;
                }
                else {
                    // 非第一次循环，都会进入else分支，此时红黑树已经有数据了
                    // k 表示 插入节点的key
                    K k = x.key;
                    // h 表示 插入节点的hash
                    int h = x.hash;
                    // kc 表示 插入节点key的class类型
                    Class<?> kc = null;
                    // 遍历红黑树插入节点
                    for (TreeNode<K,V> p = r;;) {
                        // 临时遍历ph为被比较节点hash值
                        int dir, ph;
                        K pk = p.key;
                        // 树节点左边
                        if ((ph = p.hash) > h)
                            dir = -1;
                        // 树节点右边
                        else if (ph < h)
                            dir = 1;
                        // 如果 插入节点的类型为null且 kc没有实现Comparable接口或 k与pk相同（也包含kc的class类为null或k,pk的clas类型不相同）任意满足其一
                        // 的话都会根据2者的内存hashcode决定是树的左边还是右边
                        else if ((kc == null &&
                                  (kc = comparableClassFor(k)) == null) ||
                                 (dir = compareComparables(kc, k, pk)) == 0)
                            dir = tieBreakOrder(k, pk);
                            TreeNode<K,V> xp = p;
                        // 如果p的左边、或右边没有子节点了那么么进行插入节点
                        if ((p = (dir <= 0) ? p.left : p.right) == null) {
                            // 父子节点互相连接
                            x.parent = xp;
                            if (dir <= 0)
                                xp.left = x;
                            else
                                xp.right = x;
                            // 插入的节点可能会破坏红黑树特性，调用插入调整方法
                            r = balanceInsertion(r, x);
                            // 结束遍历红黑树的循环，继续遍历链表
                            break;
                        }
                    }
                }
            }
            // 将根节点设置成r
            this.root = r;
            // 递归检查红黑树的正确性（注意：assert关键字是受java启动项配置的，-ea 开启）
            assert checkInvariants(root);
        }

        /**
         * Acquires write lock for tree restructuring.
         */
        private final void lockRoot() {
            // 直接尝试CAS的将lockState从0变成WRITER（1）状态，即从没有锁变成获取了写锁的状态，只尝试一次，没有循环。
            if (!U.compareAndSwapInt(this, LOCKSTATE, 0, WRITER))
                //如果 CAS失败，那么调用contendedLock方法，继续获取直到成功才返回
                contendedLock(); // offload to separate method
        }

        /**
         * Releases write lock for tree restructuring.
         */
        private final void unlockRoot() {
            lockState = 0;
        }

        /**
         * Possibly blocks awaiting root lock.
         */
        private final void contendedLock() {
            // 初始化一个waiting标志，默认为false，开启一个死循环
            boolean waiting = false;
            for (int s;;) {
               /**
                * 这里的 ~WAITER，即~2，即表示 -3 是一个固定值
                *  2的二进制：0000 0000 0000 0000 0000 0000 0000 0010
                * ~2的二进制：1111 1111 1111 1111 1111 1111 1111 1101（补码）
                * 显然~2是负数，读取规则取反+1为
                *           1000 0000 0000 0000 0000 0000 0000 0011（即-3）
                * 这里只是告知 ~2==-3而已没有实际意义
                * 因此 lockState为0(二进制数全是0)或者2(二进制数为10)时，lockState与 ~WAITER的结果才为 0（倒推法就可知）
                * lockState为0时，表示没有任何线程获取任何锁；
                * locKState为2时，表示只有一个写线程在等待获取锁，这也就是前面讲的find方法中，最后一个读线程释放了读锁并且还有写线程等待获取写锁的情况，实际上就是该线程
                */
                if (((s = lockState) & ~WAITER) == 0) {
                    if (U.compareAndSwapInt(this, LOCKSTATE, s, WRITER)) {
                        //条件成立：说明写线程 抢占锁成功
                         if (waiting)
                            // 如果waiting标志位为true，那么将waiter清空，因为waiter是waiting为true时设置的，表示此时没有写线程在等待写锁
                            waiter = null;
                        return;
                    }
                }
                /**
                 * 否则，判断 s & WAITER==0
                 * WAITER固定为2
                 * 如果s & WAITER为0，即需要s & 2 =0，那么s(lockState)必须为1或者大于2的数，比如4、8等等
                 * 由于不存在写并发（外面对写操作加上了synchronized锁），因此lockState一定属于大于2的数，比如4、8等等
                 * 这表示有线程获取到了读锁，此时写线程应该等待
                 *
                 */
                else if ((s & WAITER) == 0) {
                     // 尝试将lockState设置为s | WAITER  ，这里的s|WAITER就相当于s+WAITER，即将此时的lockState加上2，表示有写线程在等待获取写锁
                    if (U.compareAndSwapInt(this, LOCKSTATE, s, s | WAITER)) {
                        waiting = true;
                        // waiter设置为当前线程
                        waiter = Thread.currentThread();
                    }
                }
                /**
                 * 根据标志判断是否阻塞自己
                 * 此时写线程不再继续执行代码，而是等待被唤醒
                 * 如果被唤醒，那么可能是因为最后一个读锁也被释放了，或者是因为被中断，那么继续循环获取锁
                 * 该循环的唯一出口就是获取到了写锁该循环的唯一出口就是获取到了写锁
                 */
                else if (waiting)
                    LockSupport.park(this);
            }
        }

        /**
         * 读节点
         * Returns matching node or null if none. Tries to search
         * using tree comparisons from root, but continues linear
         * search when lock not available.
         */
        final Node<K,V> find(int h, Object k) {
            // key首要条件不能null
            if (k != null) {
                // 从first节点开始遍历，直到节点为null才停止循环
                for (Node<K,V> e = first; e != null; ) {
                    int s; K ek;
                    // WAITER|WRITER 等同于 WAITER+WRITER=1+2=3 ==>0011
                    // lockState & 0011 != 0 条件成立：说明当前TreeBin 有写等待线程 或者 写操作线程正在加锁
                    if (((s = lockState) & (WAITER|WRITER)) != 0) {
                        // 找到key直接返回e
                        if (e.hash == h &&
                            ((ek = e.key) == k || (ek != null && k.equals(ek))))
                            return e;
                        // 无法读树那么就根据链表结构依次读取，好处就是不会阻塞读取的过程
                        e = e.next;
                    }
                    // 前置条件：当前TreeBin中 写等待线程 或者 写线程 都没有
                    // 条件成立：说明添加读锁成功 每个线程都会给 LOCKSTATE+4
                    else if (U.compareAndSwapInt(this, LOCKSTATE, s,
                                                 s + READER)) {
                        // 获取到读锁，那么就从根节点遍历，TreeBin只是封装了锁，实际上找数据节点还是委托给了TreeNode来找
                        TreeNode<K,V> r, p;
                        try {
                            p = ((r = root) == null ? null :
                                 r.findTreeNode(h, k, null));
                        } finally {
                            Thread w;
                            // U.getAndAddInt(this, LOCKSTATE, -READER) == (READER|WAITER)
                            // 1.当前线程查询红黑树结束，释放当前线程的读锁 就是让 lockstate 值 - 4
                            // (READER|WAITER) = 0110 => 表示当前只有一个线程在读，且“有一个写线程在等待”
                            // 当前读线程为 TreeBin中的最后一个读线程。
                            // getAndAddInt含义是返回当前值，并不是修改值所以进入if的是最后一个读线程了，所以我们要唤醒等待写线程了
                            if (U.getAndAddInt(this, LOCKSTATE, -READER) ==
                                (READER|WAITER) && (w = waiter) != null)
                                // 如果是最后一个读线程，并且有写线程因为读锁而阻塞，要告诉写线程可以尝试获取写锁了。
                                LockSupport.unpark(w);
                        }
                        return p;
                    }
                }
            }
            return null;
        }

        /**
         * Finds or adds a node.
         * @return null if added
         */
        final TreeNode<K,V> putTreeVal(int h, K k, V v) {
            Class<?> kc = null;
            boolean searched = false;
            for (TreeNode<K,V> p = root;;) {
                int dir, ph; K pk;
                if (p == null) {
                    first = root = new TreeNode<K,V>(h, k, v, null, null);
                    break;
                }
                else if ((ph = p.hash) > h)
                    dir = -1;
                else if (ph < h)
                    dir = 1;
                else if ((pk = p.key) == k || (pk != null && k.equals(pk)))
                    return p;
                else if ((kc == null &&
                          (kc = comparableClassFor(k)) == null) ||
                         (dir = compareComparables(kc, k, pk)) == 0) {
                    if (!searched) {
                        TreeNode<K,V> q, ch;
                        searched = true;
                        if (((ch = p.left) != null &&
                             (q = ch.findTreeNode(h, k, kc)) != null) ||
                            ((ch = p.right) != null &&
                             (q = ch.findTreeNode(h, k, kc)) != null))
                            return q;
                    }
                    dir = tieBreakOrder(k, pk);
                }

                TreeNode<K,V> xp = p;
                if ((p = (dir <= 0) ? p.left : p.right) == null) {
                    TreeNode<K,V> x, f = first;
                    first = x = new TreeNode<K,V>(h, k, v, f, xp);
                    if (f != null)
                        f.prev = x;
                    if (dir <= 0)
                        xp.left = x;
                    else
                        xp.right = x;
                    if (!xp.red)
                        x.red = true;
                    else {
                        // 在这里准备插入节点，给根节点加锁
                        lockRoot();
                        try {
                            // 插入平衡调整完后，重新赋值root节点，可能在调整的过程中根节点发生了变化
                            root = balanceInsertion(root, x);
                        } finally {
                            // 解锁根节点
                            unlockRoot();
                        }
                    }
                    break;
                }
            }
            assert checkInvariants(root);
            return null;
        }

        /**
         * Removes the given node, that must be present before this
         * call.  This is messier than typical red-black deletion code
         * because we cannot swap the contents of an interior node
         * with a leaf successor that is pinned by "next" pointers
         * that are accessible independently of lock. So instead we
         * swap the tree linkages.
         *
         * @return true if now too small, so should be untreeified
         */
        final boolean removeTreeNode(TreeNode<K,V> p) {
            // 读过HashMap的我们知道，TreeNode 即包含树关系也包含链表关系
            // 那么unlink节点p在链表中的关系
            TreeNode<K,V> next = (TreeNode<K,V>)p.next;
            TreeNode<K,V> pred = p.prev;  // unlink traversal pointers
            TreeNode<K,V> r, rl;
            if (pred == null)
                first = next;
            else
                pred.next = next;
            if (next != null)
                next.prev = pred;
            if (first == null) {
                root = null;
                return true;
            }
            if ((r = root) == null || r.right == null || // too small
                (rl = r.left) == null || rl.left == null)
                return true;
            // 一旦上面进入return true的分支说明节点过少，树要退化为链表
            // 锁住树的根节点，删除节点跟HashMap流程一致没啥好说的
            lockRoot();
            try {
                TreeNode<K,V> replacement;
                TreeNode<K,V> pl = p.left;
                TreeNode<K,V> pr = p.right;
                if (pl != null && pr != null) {
                    TreeNode<K,V> s = pr, sl;
                    while ((sl = s.left) != null) // find successor
                        s = sl;
                    boolean c = s.red; s.red = p.red; p.red = c; // swap colors
                    TreeNode<K,V> sr = s.right;
                    TreeNode<K,V> pp = p.parent;
                    if (s == pr) { // p was s's direct parent
                        p.parent = s;
                        s.right = p;
                    }
                    else {
                        TreeNode<K,V> sp = s.parent;
                        if ((p.parent = sp) != null) {
                            if (s == sp.left)
                                sp.left = p;
                            else
                                sp.right = p;
                        }
                        if ((s.right = pr) != null)
                            pr.parent = s;
                    }
                    p.left = null;
                    if ((p.right = sr) != null)
                        sr.parent = p;
                    if ((s.left = pl) != null)
                        pl.parent = s;
                    if ((s.parent = pp) == null)
                        r = s;
                    else if (p == pp.left)
                        pp.left = s;
                    else
                        pp.right = s;
                    if (sr != null)
                        replacement = sr;
                    else
                        replacement = p;
                }
                else if (pl != null)
                    replacement = pl;
                else if (pr != null)
                    replacement = pr;
                else
                    replacement = p;
                if (replacement != p) {
                    TreeNode<K,V> pp = replacement.parent = p.parent;
                    if (pp == null)
                        r = replacement;
                    else if (p == pp.left)
                        pp.left = replacement;
                    else
                        pp.right = replacement;
                    p.left = p.right = p.parent = null;
                }

                root = (p.red) ? r : balanceDeletion(r, replacement);

                if (p == replacement) {  // detach pointers
                    TreeNode<K,V> pp;
                    if ((pp = p.parent) != null) {
                        if (p == pp.left)
                            pp.left = null;
                        else if (p == pp.right)
                            pp.right = null;
                        p.parent = null;
                    }
                }
            } finally {
                unlockRoot();
            }
            assert checkInvariants(root);
            return false;
        }

        /* ------------------------------------------------------------ */
        // Red-black tree methods, all adapted from CLR

        static <K,V> TreeNode<K,V> rotateLeft(TreeNode<K,V> root,
                                              TreeNode<K,V> p) {
            TreeNode<K,V> r, pp, rl;
            if (p != null && (r = p.right) != null) {
                if ((rl = p.right = r.left) != null)
                    rl.parent = p;
                if ((pp = r.parent = p.parent) == null)
                    (root = r).red = false;
                else if (pp.left == p)
                    pp.left = r;
                else
                    pp.right = r;
                r.left = p;
                p.parent = r;
            }
            return root;
        }

        static <K,V> TreeNode<K,V> rotateRight(TreeNode<K,V> root,
                                               TreeNode<K,V> p) {
            TreeNode<K,V> l, pp, lr;
            if (p != null && (l = p.left) != null) {
                if ((lr = p.left = l.right) != null)
                    lr.parent = p;
                if ((pp = l.parent = p.parent) == null)
                    (root = l).red = false;
                else if (pp.right == p)
                    pp.right = l;
                else
                    pp.left = l;
                l.right = p;
                p.parent = l;
            }
            return root;
        }

        static <K,V> TreeNode<K,V> balanceInsertion(TreeNode<K,V> root,
                                                    TreeNode<K,V> x) {
            x.red = true;
            for (TreeNode<K,V> xp, xpp, xppl, xppr;;) {
                if ((xp = x.parent) == null) {
                    x.red = false;
                    return x;
                }
                else if (!xp.red || (xpp = xp.parent) == null)
                    return root;
                if (xp == (xppl = xpp.left)) {
                    if ((xppr = xpp.right) != null && xppr.red) {
                        xppr.red = false;
                        xp.red = false;
                        xpp.red = true;
                        x = xpp;
                    }
                    else {
                        if (x == xp.right) {
                            root = rotateLeft(root, x = xp);
                            xpp = (xp = x.parent) == null ? null : xp.parent;
                        }
                        if (xp != null) {
                            xp.red = false;
                            if (xpp != null) {
                                xpp.red = true;
                                root = rotateRight(root, xpp);
                            }
                        }
                    }
                }
                else {
                    if (xppl != null && xppl.red) {
                        xppl.red = false;
                        xp.red = false;
                        xpp.red = true;
                        x = xpp;
                    }
                    else {
                        if (x == xp.left) {
                            root = rotateRight(root, x = xp);
                            xpp = (xp = x.parent) == null ? null : xp.parent;
                        }
                        if (xp != null) {
                            xp.red = false;
                            if (xpp != null) {
                                xpp.red = true;
                                root = rotateLeft(root, xpp);
                            }
                        }
                    }
                }
            }
        }

        static <K,V> TreeNode<K,V> balanceDeletion(TreeNode<K,V> root,
                                                   TreeNode<K,V> x) {
            for (TreeNode<K,V> xp, xpl, xpr;;)  {
                if (x == null || x == root)
                    return root;
                else if ((xp = x.parent) == null) {
                    x.red = false;
                    return x;
                }
                else if (x.red) {
                    x.red = false;
                    return root;
                }
                else if ((xpl = xp.left) == x) {
                    if ((xpr = xp.right) != null && xpr.red) {
                        xpr.red = false;
                        xp.red = true;
                        root = rotateLeft(root, xp);
                        xpr = (xp = x.parent) == null ? null : xp.right;
                    }
                    if (xpr == null)
                        x = xp;
                    else {
                        TreeNode<K,V> sl = xpr.left, sr = xpr.right;
                        if ((sr == null || !sr.red) &&
                            (sl == null || !sl.red)) {
                            xpr.red = true;
                            x = xp;
                        }
                        else {
                            if (sr == null || !sr.red) {
                                if (sl != null)
                                    sl.red = false;
                                xpr.red = true;
                                root = rotateRight(root, xpr);
                                xpr = (xp = x.parent) == null ?
                                    null : xp.right;
                            }
                            if (xpr != null) {
                                xpr.red = (xp == null) ? false : xp.red;
                                if ((sr = xpr.right) != null)
                                    sr.red = false;
                            }
                            if (xp != null) {
                                xp.red = false;
                                root = rotateLeft(root, xp);
                            }
                            x = root;
                        }
                    }
                }
                else { // symmetric
                    if (xpl != null && xpl.red) {
                        xpl.red = false;
                        xp.red = true;
                        root = rotateRight(root, xp);
                        xpl = (xp = x.parent) == null ? null : xp.left;
                    }
                    if (xpl == null)
                        x = xp;
                    else {
                        TreeNode<K,V> sl = xpl.left, sr = xpl.right;
                        if ((sl == null || !sl.red) &&
                            (sr == null || !sr.red)) {
                            xpl.red = true;
                            x = xp;
                        }
                        else {
                            if (sl == null || !sl.red) {
                                if (sr != null)
                                    sr.red = false;
                                xpl.red = true;
                                root = rotateLeft(root, xpl);
                                xpl = (xp = x.parent) == null ?
                                    null : xp.left;
                            }
                            if (xpl != null) {
                                xpl.red = (xp == null) ? false : xp.red;
                                if ((sl = xpl.left) != null)
                                    sl.red = false;
                            }
                            if (xp != null) {
                                xp.red = false;
                                root = rotateRight(root, xp);
                            }
                            x = root;
                        }
                    }
                }
            }
        }

        /**
         * Recursive invariant check
         */
        static <K,V> boolean checkInvariants(TreeNode<K,V> t) {
            TreeNode<K,V> tp = t.parent, tl = t.left, tr = t.right,
                tb = t.prev, tn = (TreeNode<K,V>)t.next;
            if (tb != null && tb.next != t)
                return false;
            if (tn != null && tn.prev != t)
                return false;
            if (tp != null && t != tp.left && t != tp.right)
                return false;
            if (tl != null && (tl.parent != t || tl.hash > t.hash))
                return false;
            if (tr != null && (tr.parent != t || tr.hash < t.hash))
                return false;
            if (t.red && tl != null && tl.red && tr != null && tr.red)
                return false;
            if (tl != null && !checkInvariants(tl))
                return false;
            if (tr != null && !checkInvariants(tr))
                return false;
            return true;
        }
        // Unsafe实例
        private static final sun.misc.Unsafe U;
        // lockState在内存中的偏移量
        private static final long LOCKSTATE;
        static {
            try {
                U = sun.misc.Unsafe.getUnsafe();
                Class<?> k = TreeBin.class;
                // 获取偏移量
                LOCKSTATE = U.objectFieldOffset
                    (k.getDeclaredField("lockState"));
            } catch (Exception e) {
                throw new Error(e);
            }
        }
    }

```

## 构造方法

```java

    /**
    * 无参构造器
    * 空实现，所有参数都是走默认的
    */
    public ConcurrentHashMap() {

    }

    /**
    * 根据 initialCapacity参数
    */
    public ConcurrentHashMap(int initialCapacity) {
        // initialCapacity非负校验
        if (initialCapacity < 0)
            throw new IllegalArgumentException();
        // 与HashMap不同的是，这里initialCapacity如果大于等于2的29次方的时候（HashMap这里为超过2的30次方），
        // 就重置为2的30次方
        // tableSizeFor方法是用来求出大于等于指定值的最小2次幂的
        // 在HashMap中仅仅就是对设定的数组容量取最小2次幂，而这里首先对设定值*1.5+1后进行取最小的2次幂
        int cap = ((initialCapacity >= (MAXIMUM_CAPACITY >>> 1)) ?
                   MAXIMUM_CAPACITY :
                   tableSizeFor(initialCapacity + (initialCapacity >>> 1) + 1));

        /**
        * 其实传进来的容量实际上并不是存进去的桶的个数，而是需要扩容时的个数
        * 16 * 0.75 = 12，在HashMap中，我们传进来的其实是16，需要乘负载因子后才是实际需要扩容时的阈值点
        * 所以在构造器阶段需要除以负载因子，以此来求出真正的桶的个数，那也应该是数组容量 / 默认值的0.75啊
        * 举个例子：
        * 打个比方我们传进来的是22， 那么/ 0.75的方式结果是29.3，+1后再tableSizeFor结果是：32
        * 而*1.5的方式结果是33，+1后再tableSizeFor结果是：64，那么可以看出1.5计算出的容量明细是不对的。明显多扩容了一倍
        * 也确实这是一个bug 不过多扩容一倍也不会对使用产生多大的影响
        */

        /**
        * 在JDK11中相应容量的代码也被修复了
        * long size = (long) (1.0 + (long) initialCapacity / loadFactor);
        */

        // （类似于HashMap初始化时的threshold）存放初始容量
        this.sizeCtl = cap;
    }

    public ConcurrentHashMap(Map<? extends K, ? extends V> m) {
        this.sizeCtl = DEFAULT_CAPACITY;
        putAll(m);
    }

    public ConcurrentHashMap(int initialCapacity, float loadFactor) {
        this(initialCapacity, loadFactor, 1);
    }
    /**
    * @param initialCapacity 初始化的容量,通过位运算根据这个值计算出一个2的N次幂的值,来作为 hash buckets数组的size.
    * @param loadFactor hash buckets的密度,根据这个值来确定是否需要扩容.默认0.75
    * @param concurrencyLevel 并发更新线程的预估数量.默认1.
    */
    public ConcurrentHashMap(int initialCapacity,
                             float loadFactor, int concurrencyLevel) {
        // 验证参数有效性
        if (!(loadFactor > 0.0f) || initialCapacity < 0 || concurrencyLevel <= 0)
            throw new IllegalArgumentException();
        // 如果初始容量小于并发等级 则初始容量为并发等级
        if (initialCapacity < concurrencyLevel)   // Use at least as many bins
            initialCapacity = concurrencyLevel;   // as estimated threads
        // 因为小数会截断，所以+1
        long size = (long)(1.0 + (long)initialCapacity / loadFactor);
        int cap = (size >= (long)MAXIMUM_CAPACITY) ?
            MAXIMUM_CAPACITY : tableSizeFor((int)size);
        this.sizeCtl = cap;
    }


```

## 方法

### putVal

```java
    final V putVal(K key, V value, boolean onlyIfAbsent) {
        // 检验参数是否合法
        if (key == null || value == null) throw new NullPointerException();
        int hash = spread(key.hashCode());
        int binCount = 0;
        // 死循环
        for (Node<K,V>[] tab = table;;) {
            Node<K,V> f; int n, i, fh;
            // 如果 table为空
            if (tab == null || (n = tab.length) == 0)
                // 初始化table
                tab = initTable();
            /**
            * 这个地方为什么不直接用tab[i]来找元素呢？
            * 虽然table数组本身是增加了volatile属性，但是“volatile的数组只针对数组的引用具有volatile的语义，而不是它的元素”。
            * 所以如果有其他线程对这个数组的元素进行写操作，那么当前线程来读的时候不一定能读到最新的值。
            */
            // 如果通过CAS加载i对应位置的元素为null
            else if ((f = tabAt(tab, i = (n - 1) & hash)) == null) {
                // CAS设置元素，true设置成功直接break循环
                if (casTabAt(tab, i, null,
                             new Node<K,V>(hash, key, value, null)))
                    break;                   // no lock when adding to empty bin
            }
            // 如果当前的桶的第一个元素是一个ForwardingNode节点，说明map正在扩容，则该线程尝试加入扩容
            else if ((fh = f.hash) == MOVED)
                tab = helpTransfer(tab, f);
            else {
                // 如果桶数组已经初始化好了，该扩容的也扩容了，并且根据哈希定位到的桶中已经有元素了,那么直接给桶进行加锁，
                // 这里通过synchronized关键字进行实现
                V oldVal = null;
                synchronized (f) {
                    // 双重检查，防止索引i对应的根节点f内存地址已经被其他线程修改
                    // 扩容会更改桶根节点f的地址
                    if (tabAt(tab, i) == f) {
                        // 如果根节点f的hash值大于等于0 证明是链表节点
                        if (fh >= 0) {
                            // 首先binCount赋值1，因为在循环完之后binCount才自增
                            binCount = 1;
                            for (Node<K,V> e = f;; ++binCount) {
                                K ek;
                                // hash匹配并且key不为null且相同
                                if (e.hash == hash &&
                                    ((ek = e.key) == key ||
                                     (ek != null && key.equals(ek)))) {
                                    // 获取oldVla
                                    oldVal = e.val;
                                    // putIfAbsent时才进去
                                    if (!onlyIfAbsent)
                                        e.val = value;
                                    // 由于找到了直接退出循环
                                    break;
                                }
                                Node<K,V> pred = e;
                                // 一直遍历链表，最终没找到直接插入节点
                                if ((e = e.next) == null) {
                                    pred.next = new Node<K,V>(hash, key,
                                                              value, null);
                                    // 退出循环
                                    break;
                                }
                            }
                        }
                        // 如果f节点是TreeBin类型，TreeBin的hash是负数
                        else if (f instanceof TreeBin) {
                            Node<K,V> p;
                            binCount = 2;
                            // 调用 TreeBin的putTreeVal方法
                            if ((p = ((TreeBin<K,V>)f).putTreeVal(hash, key,
                                                           value)) != null) {
                                oldVal = p.val;
                                // putIfAbsent不会进入下面分支
                                if (!onlyIfAbsent)
                                    p.val = value;
                            }
                        }
                    }
                }
                // binCount前提条件不等于0
                if (binCount != 0) {
                    // 如果 binCount大于链表转树的节点个数阈值
                    if (binCount >= TREEIFY_THRESHOLD)
                        treeifyBin(tab, i);
                    if (oldVal != null)
                        return oldVal;
                    // 退出循环
                    break;
                }
            }
        }
        addCount(1L, binCount);
        return null;
    }

```

### spread（计算 hash 值）

(h ^ (h >>> 16))的作用就是让 hash 值 h 的高 16 与低 16 异或让值分布的更加散列减少冲突，那么 HASH_BITS 的作用是什么呢？

```java
    static final int spread(int h) {
        return (h ^ (h >>> 16)) & HASH_BITS;
    }
```

### initTable

构造函数只是对 sizeCtl 进行了初始化，并没有对存放节点 Node 进行初始化，在该方法进行数组的初始化

```java

    private final Node<K,V>[] initTable() {
        Node<K,V>[] tab; int sc;
        // 当table为空时就不停循环
        while ((tab = table) == null || tab.length == 0) {
            // 如果 sizeCtl小于0代表有其他线程正则执行 initTable 方法
            if ((sc = sizeCtl) < 0)
                // 线程主动让出CPU时间
                Thread.yield(); // lost initialization race; just spin
            // 如果 sizeCtl==0 通过CAS更新sizeCtl为-1如果成功说明该线程可以执行initTable方法进行初始化
            else if (U.compareAndSwapInt(this, SIZECTL, sc, -1)) {
                try {
                    if ((tab = table) == null || tab.length == 0) {
                        // 如果 sizeCtl>0 初始化大小为sizeCtl，否则初始化大小为16
                        int n = (sc > 0) ? sc : DEFAULT_CAPACITY;
                        @SuppressWarnings("unchecked")
                        // 创建数组
                        Node<K,V>[] nt = (Node<K,V>[])new Node<?,?>[n];
                        // 赋值
                        table = tab = nt;
                        // 算出扩容阈值 sc*0.75
                        sc = n - (n >>> 2);
                    }
                } finally {
                    // 将下次扩容的阈值赋给 sizeCtl
                    sizeCtl = sc;
                }
                // 结束循环
                break;
            }
        }
        // 返回数组
        return tab;
    }

```

### tabAt

```java
    /**
    * 强制从主存中加载对应i的数组元素，要求属性被volatile修饰，否则功能和getObject方法相同
    */
    static final <K,V> Node<K,V> tabAt(Node<K,V>[] tab, int i) {
        return (Node<K,V>)U.getObjectVolatile(tab, ((long)i << ASHIFT) + ABASE);
    }
```

### casTabAt

```java
    /**
    * CAS给Node数组设置值
    */
    static final <K,V> boolean casTabAt(Node<K,V>[] tab, int i,
                                        Node<K,V> c, Node<K,V> v) {
        return U.compareAndSwapObject(tab, ((long)i << ASHIFT) + ABASE, c, v);
    }

```

### helpTransfer

```java

    final Node<K,V>[] helpTransfer(Node<K,V>[] tab, Node<K,V> f) {
        Node<K,V>[] nextTab; int sc;
        // 如果 table不是空且node节点是ForwardingNode类型（数据检验）
        // 且 node 节点的 nextTable（新 table） 不是空（数据校验）
        if (tab != null && (f instanceof ForwardingNode) &&
            (nextTab = ((ForwardingNode<K,V>)f).nextTable) != null) {
            // 算出扩容标志
            int rs = resizeStamp(tab.length);
            // 如果 nextTab 没有被并发修改 且 tab 也没有被并发修改
            // 且 sizeCtl  < 0 （说明还在扩容）
            while (nextTab == nextTable && table == tab &&
                   (sc = sizeCtl) < 0) {
                // TODO: 这里回来再分析
                if ((sc >>> RESIZE_STAMP_SHIFT) != rs || sc == rs + 1 ||
                    sc == rs + MAX_RESIZERS || transferIndex <= 0)
                    break;
                if (U.compareAndSwapInt(this, SIZECTL, sc, sc + 1)) {
                    transfer(tab, nextTab);
                    break;
                }
            }
            return nextTab;
        }
        return table;
    }


```

### resizeStamp （根据当前容量生成一个扩容标记）

根据当前 tab 容量 n 非 0 最高为的 0 的个数与 1 左移 15 进行或运算得出

```java
 static final int resizeStamp(int n) {
    return Integer.numberOfLeadingZeros(n) | (1 << (RESIZE_STAMP_BITS - 1));
 }
```

### treeifyBin

```java

    private final void treeifyBin(Node<K,V>[] tab, int index) {
        // n:数组长度
        Node<K,V> b; int n, sc;
        if (tab != null) {
            // 如果桶的数量小于64，那么不需要链表转树表，没必要，直接扩容数组
            if ((n = tab.length) < MIN_TREEIFY_CAPACITY)
                tryPresize(n << 1);
            // 否则cas获取tab对应index的桶的根元素
            else if ((b = tabAt(tab, index)) != null && b.hash >= 0) {
                // 对于两边转树表的代码代码块进行synchronized加锁
                synchronized (b) {
                    // 双重检查，确定b是否还是index对应桶的根元素
                    if (tabAt(tab, index) == b) {
                        TreeNode<K,V> hd = null, tl = null;
                        for (Node<K,V> e = b; e != null; e = e.next) {
                            TreeNode<K,V> p =
                                new TreeNode<K,V>(e.hash, e.key, e.val,
                                                  null, null);
                            if ((p.prev = tl) == null)
                                hd = p;
                            else
                                tl.next = p;
                            tl = p;
                        }
                        setTabAt(tab, index, new TreeBin<K,V>(hd));
                    }
                }
            }
        }
    }

```

### tryPresize

tryPreSize 是 ConcurrentHashMap 扩容方法之一

```java

    private final void tryPresize(int size) {
        // 如果大小为MAXIMUM_CAPACITY最大总量的一半，那么直接扩容为MAXIMUM_CAPACITY，否则计算最小幂次方
        int c = (size >= (MAXIMUM_CAPACITY >>> 1)) ? MAXIMUM_CAPACITY :
            tableSizeFor(size + (size >>> 1) + 1);
        int sc;
        // 如果sizeCtl为负数说明在其它地方进行了扩容，所以这里的条件是非负数
        while ((sc = sizeCtl) >= 0) {
            Node<K,V>[] tab = table; int n;
            // 如果table还未进行初始化
            if (tab == null || (n = tab.length) == 0) {
                n = (sc > c) ? sc : c;
                // cas修改sizeCtl为-1，表示table正在进行初始化
                if (U.compareAndSwapInt(this, SIZECTL, sc, -1)) {
                    try {
                        // 确认其他线程没有对table修改
                        if (table == tab) {
                            @SuppressWarnings("unchecked")
                            Node<K,V>[] nt = (Node<K,V>[])new Node<?,?>[n];
                            table = nt;
                            // 等价于0.75*n
                            sc = n - (n >>> 2);
                        }
                    } finally {
                        // 将扩容后的阈值赋值给sizeCtl
                        sizeCtl = sc;
                    }
                }
            }
            // 如果扩容大小没有达到阈值，或者超过最大容量
            else if (c <= sc || n >= MAXIMUM_CAPACITY)
                // 退出循环
                break;
            // 确认其他线程没有对table修改
            else if (tab == table) {
                // 根据table的长度生成扩容戳
                int rs = resizeStamp(n);
                if (sc < 0) {
                    Node<K,V>[] nt;
                   /**
                    * 1.sc 右移 16位 是否和当前容量生成的扩容戳相同，相同则代是在同一容量下进行的扩容
                    * 2.第二个和第三个判断 判断当前帮助扩容线程数是否已达到MAX_RESIZERS最大扩容线程数
                    * 3.第四个和第五个判断 为了确保transfer()方法初始化完毕
                    */
                    if ((sc >>> RESIZE_STAMP_SHIFT) != rs || sc == rs + 1 ||
                        sc == rs + MAX_RESIZERS || (nt = nextTable) == null ||
                        transferIndex <= 0)
                        break;
                    if (U.compareAndSwapInt(this, SIZECTL, sc, sc + 1))
                        transfer(tab, nt);
                }
                /**
                 * 如果没有线程在进行扩容，那么cas修改sizeCtl值，作为扩容的发起，rs左移RESIZE_STAMP_SHIFT位+2
                 * 在 resizeStamp中 (1 << (RESIZE_STAMP_BITS - 1))，然后计算SIZECTL时左移 RESIZE_STAMP_SHIFT，
                 * 那么 相当于1<<31==2^31,即最高位1为负数，所以说为什么扩容时sizeCtl是负数
                 * 所以sizeCtl高RESIZE_STAMP_BITS位为生成戳，低RESIZE_STAMP_SHIFT位为扩容线程数
                 */
                else if (U.compareAndSwapInt(this, SIZECTL, sc,
                                             (rs << RESIZE_STAMP_SHIFT) + 2))
                    transfer(tab, null);
            }
        }
    }
```

### transfer 转移数据

扩容是 ConcurrentHashMap 的精华之一，扩容操作的核心在于数据的转移，在单线程环境下数据的转移很简单，无非就是把旧数组中的数据迁移到新的数组。
但是这在多线程环境下，在扩容的时候其他线程也可能正在添加元素，这时又触发了扩容怎么办？可能大家想到的第一个解决方案是加互斥锁，把转移过程锁住，
虽然是可行的解决方案，但是会带来较大的性能开销。因为互斥锁会导致所有访问临界区的线程陷入到阻塞状态，持有锁的线程耗时越长，其他竞争线程就会一直被阻塞，
导致吞吐量较低。而且还可能导致死锁。 而 ConcurrentHashMap 并没有直接加锁，而是采用 CAS 实现无锁的并发同步策略，最精华的部分是它可以利用多线程来进行协同扩容
简单来说，它把 Node 数组当作多个线程之间共享的任务队列，然后通过维护一个指针来划分每个线程锁负责的区间，每个线程通过区间逆向遍历来实现扩容，
一个已经迁移完的 bucket 会被替换为一个 ForwardingNode 节点，标记当前 bucket 已经被其他线程迁移完了

```java

    private final void transfer(Node<K,V>[] tab, Node<K,V>[] nextTab) {
        int n = tab.length, stride;
        // 这里的目的是让每个 CPU 处理的桶一样多，避免出现转移任务不均匀的现象
        // 根据操作系统的 CPU 核数和集合 length 计算每个核一轮处理桶的个数，最小是16
        if ((stride = (NCPU > 1) ? (n >>> 3) / NCPU : n) < MIN_TRANSFER_STRIDE)
            stride = MIN_TRANSFER_STRIDE; // subdivide range
        // nextTab未初始化，nextTab是用来扩容的node数组
        if (nextTab == null) {            // initiating
            try {
                @SuppressWarnings("unchecked")
                // 2倍扩容
                Node<K,V>[] nt = (Node<K,V>[])new Node<?,?>[n << 1];
                // 赋值给nextTab
                nextTab = nt;
            } catch (Throwable ex) {      // try to cope with OOME
                // 扩容失败，sizeCtl使用int的最大值
                sizeCtl = Integer.MAX_VALUE;
                return;
            }
            // 更新成员变量
            nextTable = nextTab;
            // 更新转移下标，表示转移时的下标
            transferIndex = n;
        }
        // 新tab的长度
        int nextn = nextTab.length;
        // 创建一个 fwd 节点，用于占位。当别的线程发现这个槽位中是 fwd 类型的节点，则跳过这个节点。
        ForwardingNode<K,V> fwd = new ForwardingNode<K,V>(nextTab);
        boolean advance = true;
        // 完成状态，如果是 true，就结束此方法。
        boolean finishing = false; // to ensure sweep before committing nextTab
        for (int i = 0, bound = 0;;) {
            Node<K,V> f; int fh;
            while (advance) {
                int nextIndex, nextBound;
                // 对 i 减一，判断是否大于等于 bound （正常情况下，如果大于 bound 不成立，说明该线程上次领取的任务已经完成了。那么，需要在下面继续领取任务）
                // 如果对 i 减一大于等于 bound（还需要继续做任务），或者完成了，修改推进状态为 false，不能推进了。任务成功后修改推进状态为 true。
                // 通常，第一次进入循环，i-- 这个判断会无法通过，从而走下面的 nextIndex 赋值操作（获取最新的转移下标）。其余情况都是：如果可以推进，将 i 减一，然后修改成不可推进。如果 i 对应的桶处理成功了，改成可以推进。
                if (--i >= bound || finishing)
                    advance = false;
               /**
                *  这里有2个作用:
                *  1:由于transferIndex的原子性即更新最新的转移下标
                *  2:当一个线程处理完自己的区间时，如果还有剩余区间的没有别的线程处理。再次获取区间。
                */
                else if ((nextIndex = transferIndex) <= 0) {
                    i = -1;
                    advance = false;
                }
                // CAS 修改 transferIndex，即 length - 区间值，留下剩余的区间值供后面的线程使用
                else if (U.compareAndSwapInt
                         (this, TRANSFERINDEX, nextIndex,
                          nextBound = (nextIndex > stride ?
                                       nextIndex - stride : 0))) {
                    // 这个值就是当前线程可以处理的最小当前区间最小下标
                    bound = nextBound;
                    // i便是索引【nextIndex-1】
                    i = nextIndex - 1;
                    // 这里设置 false，是为了防止在没有成功处理一个桶的情况下却进行了推进，这样对导致漏掉某个桶。下面的 if (tabAt(tab, i) == f) 判断会出现这样的情况。
                    advance = false;
                }
            }
            // 如果 i 小于0 （不在 tab 下标内，按照上面的判断，领取最后一段区间的线程扩容结束）
            // i >= n 当前处理的范围大于旧链表最大长度，已经不需要拷贝越界数据
            // i + n >= nextn 。nextn表示新哈希表长度，如果当前长度超过新哈希表长度，
            //  证明是不合法的
            if (i < 0 || i >= n || i + n >= nextn) {
                int sc;
                if (finishing) {
                    // 结束扩容，删除nextTable，更新 table，更新阈值sizeCtl
                    nextTable = null;
                    table = nextTab;
                    // 新长度*0.75
                    sizeCtl = (n << 1) - (n >>> 1);
                    return;
                }
                // 尝试将 sc -1. 表示这个线程结束帮助扩容了，将 sc 的低 16 位减一
                if (U.compareAndSwapInt(this, SIZECTL, sc = sizeCtl, sc - 1)) {
                    // 如果 sc - 2 不等于标识符左移 16 位。如果他们相等了，说明没有线程在帮助他们扩容了。也就是说，扩容结束了
                    if ((sc - 2) != resizeStamp(n) << RESIZE_STAMP_SHIFT)
                        return;
                    // 那么将  finishing，advance设置成true
                    finishing = advance = true;
                    // 再次循环检查一下整张表
                    i = n; // recheck before commit
                }
            }
            // 获取老 tab i 下标位置的变量，如果是 null，就使用 fwd 占位。
            else if ((f = tabAt(tab, i)) == null)
                // 如果成功写入 fwd 占位，当前索引i对应老数组已经全部转移，再次推进一个下标
                advance = casTabAt(tab, i, null, fwd);
            // 说明别的线程已经处理过了，再次推进一个下标
            else if ((fh = f.hash) == MOVED)
                advance = true; // already processed
            else {
                // 到这里，说明这个位置有实际值了，且不是占位符。需要进行转移
                // 随即对这个节点上锁。为什么上锁，防止 putVal 的时候向链表插入数据
                synchronized (f) {
                    // 检查i下标处的桶节点是否和 f相同，防止其他线程已经修改了节点f
                    if (tabAt(tab, i) == f) {
                        // low, height 高位桶，低位桶
                        Node<K,V> ln, hn;
                        // 如果 f 的 hash 值大于 0 。TreeBin 的 hash 是 -2
                        if (fh >= 0) {
                            // 进入该分支说明是链表
                            // 对老数组长度进行与运算（第一个操作数的的第n位与第二个操作数的第n位如果都是1，那么结果的第n为也为1，否则为0）
                            // 因此跟n做位与运算的结果只能为0或者为n
                            int runBit = fh & n;
                            // lastRun代表的是 lastRun对应节点的后面一条链子的与旧长度n的去与结果都是一样的，区别只是放在低位还是高位
                            Node<K,V> lastRun = f;
                            // 遍历这个桶
                            for (Node<K,V> p = f.next; p != null; p = p.next) {
                                // 取于桶中每个节点的 hash 值
                                int b = p.hash & n;
                                if (b != runBit) {
                                    // 更新 runBit，用于下面判断 lastRun 该赋值给 ln 还是 hn
                                    runBit = b;
                                    // 这个 lastRun 保证后面的节点与自己的取于值相同，避免后面没有必要的循环
                                    lastRun = p;
                                }
                            }
                            // 如果 p.hash & n ==0 说明在新的数组上索引不变，设置到低位节点上去
                            // 这些我们在hashMap里有分析过
                            if (runBit == 0) {
                                ln = lastRun;
                                hn = null;
                            }
                            // 否则设置在高位节点上
                            else {
                                hn = lastRun;
                                ln = null;
                            }
                            // 再次循环，生成两个链表，lastRun 作为停止条件，这样就是避免无谓的循环（lastRun 后面都是相同的取于结果）
                            for (Node<K,V> p = f; p != lastRun; p = p.next) {
                                int ph = p.hash; K pk = p.key; V pv = p.val;
                                if ((ph & n) == 0)
                                    ln = new Node<K,V>(ph, pk, pv, ln);
                                else
                                    hn = new Node<K,V>(ph, pk, pv, hn);
                            }
                            // cas设置nextTab高低位链表
                            setTabAt(nextTab, i, ln);
                            setTabAt(nextTab, i + n, hn);
                            // 设置原tab对应索引i上设置fwd节点代表原数组已经转移完成
                            setTabAt(tab, i, fwd);
                            // 继续向后推进
                            advance = true;
                        }
                        // 如果是红黑树
                        else if (f instanceof TreeBin) {
                            TreeBin<K,V> t = (TreeBin<K,V>)f;
                            TreeNode<K,V> lo = null, loTail = null;
                            TreeNode<K,V> hi = null, hiTail = null;
                            int lc = 0, hc = 0;
                            // 遍历
                            for (Node<K,V> e = t.first; e != null; e = e.next) {
                                int h = e.hash;
                                TreeNode<K,V> p = new TreeNode<K,V>
                                    (h, e.key, e.val, null, null);
                                // 和链表相同的判断，与运算 == 0 的放在低位
                                if ((h & n) == 0) {
                                    if ((p.prev = loTail) == null)
                                        lo = p;
                                    else
                                        loTail.next = p;
                                    loTail = p;
                                    ++lc;
                                }
                                // 不是 0 的放在高位
                                else {
                                    if ((p.prev = hiTail) == null)
                                        hi = p;
                                    else
                                        hiTail.next = p;
                                    hiTail = p;
                                    ++hc;
                                }
                            }
                            // 如果树的节点数小于等于 6，那么转成链表，反之，创建一个新的树
                            ln = (lc <= UNTREEIFY_THRESHOLD) ? untreeify(lo) :
                                (hc != 0) ? new TreeBin<K,V>(lo) : t;
                            hn = (hc <= UNTREEIFY_THRESHOLD) ? untreeify(hi) :
                                (lc != 0) ? new TreeBin<K,V>(hi) : t;
                            // 低位树
                            setTabAt(nextTab, i, ln);
                            // 高位数
                            setTabAt(nextTab, i + n, hn);
                            // 旧的设置成占位符
                            setTabAt(tab, i, fwd);
                            // 继续向后推进
                            advance = true;
                        }
                    }
                }
            }
        }
    }

```

### addCount

[文章参考](https://blog.csdn.net/every__day/article/details/115030000)
我觉得这篇解释的很好了

计数总逻辑，通过 CounterCell 或是 baseCount，来保证多线程环境下计数问题。

- 无竞争条件下，执行 put() 方法时，操作 baseCount 实现计数
- 首次竞争条件下，执行 put()方法，会初始化 CounterCell ，并实现计数
- CounterCell 一旦初始化，计数就优先使用 CounterCell
- 每个线程，要么修改 CounterCell 、要么修改 baseCount，实现计数
- CounterCell 在竞争特别严重时，会扩容。（扩容上限与 CPU 核数有关，不会一直扩容）

```java

    private final void addCount(long x, int check) {
        CounterCell[] as; long b, s;
        // 如果计数盒子不是空 或者 如果修改 baseCount 失败
        if ((as = counterCells) != null ||
            !U.compareAndSwapLong(this, BASECOUNT, b = baseCount, s = b + x)) {
            CounterCell a; long v; int m;
            boolean uncontended = true;
            // 如果计数盒子是空（尚未出现并发）
            // 如果随机取余一个数组位置为空 或者
            // 修改这个槽位的变量失败（出现并发了）
            // 执行 fullAddCount 方法。并结束
            if (as == null || (m = as.length - 1) < 0 ||
                (a = as[ThreadLocalRandom.getProbe() & m]) == null ||
                !(uncontended =
                  U.compareAndSwapLong(a, CELLVALUE, v = a.value, v + x))) {
                fullAddCount(x, uncontended);
                return;
            }
            if (check <= 1)
                return;
            s = sumCount();
        }
        // 检查是否需要扩容，在 putVal 方法调用时，默认就是要检查的
        if (check >= 0) {
            Node<K,V>[] tab, nt; int n, sc;
            while (s >= (long)(sc = sizeCtl) && (tab = table) != null &&
                   (n = tab.length) < MAXIMUM_CAPACITY) {
                int rs = resizeStamp(n);
                // 说明正在进行扩容
                if (sc < 0) {
                    // 扩容戳不一致，扩容结束，扩容线程达到最大，nextTable为空，transferIndex扩容下标为负数直接结束循环
                    if ((sc >>> RESIZE_STAMP_SHIFT) != rs || sc == rs + 1 ||
                        sc == rs + MAX_RESIZERS || (nt = nextTable) == null ||
                        transferIndex <= 0)
                        break;
                    // cas设置成功，说明可以参与扩容
                    if (U.compareAndSwapInt(this, SIZECTL, sc, sc + 1))
                        transfer(tab, nt);
                }
                // 没有线程在扩容，作为扩容的发起方
                else if (U.compareAndSwapInt(this, SIZECTL, sc,
                                             (rs << RESIZE_STAMP_SHIFT) + 2))
                    transfer(tab, null);
                s = sumCount();
            }
        }
    }

```

### fullAddCount

```java

    private final void fullAddCount(long x, boolean wasUncontended) {
        int h;
        if ((h = ThreadLocalRandom.getProbe()) == 0) {
            ThreadLocalRandom.localInit();      // force initialization
            h = ThreadLocalRandom.getProbe();
            wasUncontended = true;
        }
        boolean collide = false;                // True if last slot nonempty
        for (;;) {
            CounterCell[] as; CounterCell a; int n; long v;
            if ((as = counterCells) != null && (n = as.length) > 0) {
                if ((a = as[(n - 1) & h]) == null) {
                    if (cellsBusy == 0) {            // Try to attach new Cell
                        CounterCell r = new CounterCell(x); // Optimistic create
                        if (cellsBusy == 0 &&
                            U.compareAndSwapInt(this, CELLSBUSY, 0, 1)) {
                            boolean created = false;
                            try {               // Recheck under lock
                                CounterCell[] rs; int m, j;
                                if ((rs = counterCells) != null &&
                                    (m = rs.length) > 0 &&
                                    rs[j = (m - 1) & h] == null) {
                                    rs[j] = r;
                                    created = true;
                                }
                            } finally {
                                cellsBusy = 0;
                            }
                            if (created)
                                break;
                            continue;           // Slot is now non-empty
                        }
                    }
                    collide = false;
                }
                else if (!wasUncontended)       // CAS already known to fail
                    wasUncontended = true;      // Continue after rehash
                else if (U.compareAndSwapLong(a, CELLVALUE, v = a.value, v + x))
                    break;
                // 这个地方很巧妙，当 counterCells比 NCPU大时，已经没必要扩容，NCPU决定了同时最多只有NCPU个线程在
                // counterCells中写值，所以将扩容标志设置成false，本次线程不用扩容了counterCells
                else if (counterCells != as || n >= NCPU)
                    collide = false;            // At max size or stale
                else if (!collide)
                    collide = true;
                // cas  cellsBusy状态0->1 成功，那么就进行2倍扩容
                else if (cellsBusy == 0 &&
                         U.compareAndSwapInt(this, CELLSBUSY, 0, 1)) {
                    try {
                        if (counterCells == as) {// Expand table unless stale
                            CounterCell[] rs = new CounterCell[n << 1];
                            for (int i = 0; i < n; ++i)
                                rs[i] = as[i];
                            counterCells = rs;
                        }
                    } finally {
                        cellsBusy = 0;
                    }
                    collide = false;
                    continue;                   // Retry with expanded table
                }
                // 扩容了之后rehash下，重新生成
                h = ThreadLocalRandom.advanceProbe(h);
            }
            else if (cellsBusy == 0 && counterCells == as &&
                     U.compareAndSwapInt(this, CELLSBUSY, 0, 1)) {
                boolean init = false;
                try {                           // Initialize table
                    if (counterCells == as) {
                        CounterCell[] rs = new CounterCell[2];
                        rs[h & 1] = new CounterCell(x);
                        counterCells = rs;
                        init = true;
                    }
                } finally {
                    cellsBusy = 0;
                }
                if (init)
                    break;
            }
            // cas修改BASECOUNT，成功之后结束循环
            else if (U.compareAndSwapLong(this, BASECOUNT, v = baseCount, v + x))
                break;                          // Fall back on using base
        }
    }

```

### get（无锁查询 Map）

```java

     public V get(Object key) {
        Node<K,V>[] tab; Node<K,V> e, p; int n, eh; K ek;
        int h = spread(key.hashCode());
        if ((tab = table) != null && (n = tab.length) > 0 &&
            (e = tabAt(tab, (n - 1) & h)) != null) {
            if ((eh = e.hash) == h) {
                if ((ek = e.key) == key || (ek != null && key.equals(ek)))
                    return e.val;
            }
            // eh<0,这代表是TreeBin,调用TreeBin#find（之前分析过了TreeBin里有读写锁，写数据才会阻塞，而读是不会的）
            else if (eh < 0)
                return (p = e.find(h, key)) != null ? p.val : null;
            // 循环链表寻找节点
            while ((e = e.next) != null) {
                if (e.hash == h &&
                    ((ek = e.key) == key || (ek != null && key.equals(ek))))
                    return e.val;
            }
        }
        return null;
    }
```
