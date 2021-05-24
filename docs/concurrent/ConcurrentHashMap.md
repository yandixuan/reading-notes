# ConcurrentHashMap

[文章参考](https://blog.csdn.net/weixin_30342639/article/details/107420546)

Java 7 为实现并行访问，引入了 Segment 这一结构，实现了分段锁，理论上最大并发度与 Segment 个数相等。

Java 8 放弃了一个 HashMap 被一个 Segment 封装加上锁的复杂设计，取而代之的是在 HashMap 的每个 Node 上增加 CAS + Synchronized 来保证并发安全进行实现。

同时为了提高哈希碰撞下的寻址性能，Java 8 在链表长度超过一定阈值（8）时将链表（寻址时间复杂度为 O(N)）转换为 红黑树（寻址时间复杂度为 O(log(N))）

那么我肯定是基于 java8 进行源码学习

:::tip 提示
在 HashMap 中是允许 key 和 value 为 null 的，而在 ConcurrentHashMap 中则是不允许的会直接抛出空指针异常。
在 HashMap 根据 key 获取的值是 null，而我们根本分不清楚到底这个 key 是不存在导致 get 为 null 还是存在还是值为 null，确实但是 hashMap 中我们可以
通过 containsKey 来判断属于哪一种情况，而在多线程的环境中，null 存在二义性允许，索性 Doug Lea 设定好代码规范 key，value 都不能为 null
:::

```java
    public class ConcurrentHashMap<K,V> extends AbstractMap<K,V>
    implements ConcurrentMap<K,V>, Serializable {
        private static final long serialVersionUID = 7249069246763182397L;

    ...省略
    }
```

## 属性

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
        // 遍历Node数组
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
            else if ((f = tabAt(tab, i = (n - 1) & hash)) == null) {
                if (casTabAt(tab, i, null,
                             new Node<K,V>(hash, key, value, null)))
                    break;                   // no lock when adding to empty bin
            }
            else if ((fh = f.hash) == MOVED)
                tab = helpTransfer(tab, f);
            else {
                V oldVal = null;
                synchronized (f) {
                    if (tabAt(tab, i) == f) {
                        if (fh >= 0) {
                            binCount = 1;
                            for (Node<K,V> e = f;; ++binCount) {
                                K ek;
                                if (e.hash == hash &&
                                    ((ek = e.key) == key ||
                                     (ek != null && key.equals(ek)))) {
                                    oldVal = e.val;
                                    if (!onlyIfAbsent)
                                        e.val = value;
                                    break;
                                }
                                Node<K,V> pred = e;
                                if ((e = e.next) == null) {
                                    pred.next = new Node<K,V>(hash, key,
                                                              value, null);
                                    break;
                                }
                            }
                        }
                        else if (f instanceof TreeBin) {
                            Node<K,V> p;
                            binCount = 2;
                            if ((p = ((TreeBin<K,V>)f).putTreeVal(hash, key,
                                                           value)) != null) {
                                oldVal = p.val;
                                if (!onlyIfAbsent)
                                    p.val = value;
                            }
                        }
                    }
                }
                if (binCount != 0) {
                    if (binCount >= TREEIFY_THRESHOLD)
                        treeifyBin(tab, i);
                    if (oldVal != null)
                        return oldVal;
                    break;
                }
            }
        }
        addCount(1L, binCount);
        return null;
    }

```

### spread

### initTable

构造函数只是对 sizeCtl 进行了初始化，并没有对存放节点 Node 进行初始化，在该方法进行数组的初始化

```javau

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
    static final <K,V> Node<K,V> tabAt(Node<K,V>[] tab, int i) {
        return (Node<K,V>)U.getObjectVolatile(tab, ((long)i << ASHIFT) + ABASE);
    }
```

### casTabAt
